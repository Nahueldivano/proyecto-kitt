import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { encrypt } from "@/lib/crypto"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.passwordHash) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!passwordMatch) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          onboardingDone: user.onboardingDone,
        }
      },
    }),
    // Google solo se activa si las credenciales están configuradas
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope:
                  "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    // Re-use the Edge-safe session callback from auth.config.ts
    session: authConfig.callbacks!.session!,

    async signIn({ user, account }) {
      // Login con Google: crear tenant + user + guardar tokens Gmail si no existe
      if (account?.provider === "google" && user.email) {
        try {
          let dbUser = await db.user.findUnique({
            where: { email: user.email },
          })

          if (!dbUser) {
            const tenant = await db.tenant.create({
              data: {
                name: user.name ?? user.email,
                config: {
                  assistantName: "KITT",
                  tone: "professional",
                  model: "claude-opus-4-7",
                  country: "ES",
                },
              },
            })

            dbUser = await db.user.create({
              data: {
                email: user.email,
                name: user.name,
                tenantId: tenant.id,
                onboardingDone: false,
              },
            })
          }

          if (account.access_token && account.refresh_token) {
            await db.gmailConnection.upsert({
              where: { tenantId: dbUser.tenantId },
              update: {
                email: user.email,
                accessToken: encrypt(account.access_token),
                refreshToken: encrypt(account.refresh_token),
              },
              create: {
                tenantId: dbUser.tenantId,
                email: user.email,
                accessToken: encrypt(account.access_token),
                refreshToken: encrypt(account.refresh_token),
              },
            })
          }

          return true
        } catch (error) {
          console.error("[auth] Error en signIn con Google:", error)
          return false
        }
      }

      return true
    },

    async jwt({ token, user, trigger, session }) {
      // Enriquecer el token en el primer login (user solo viene en ese momento)
      if (user) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
        })
        if (dbUser) {
          token.tenantId = dbUser.tenantId
          token.onboardingDone = dbUser.onboardingDone
          token.sub = dbUser.id
        }
      }

      // Actualizar token cuando se llama update() desde el cliente
      if (trigger === "update" && session?.onboardingDone !== undefined) {
        token.onboardingDone = session.onboardingDone
      }

      return token
    },
  },
})
