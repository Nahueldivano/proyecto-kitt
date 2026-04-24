import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { encrypt } from "@/lib/crypto"

// Extensión de tipos para el JWT y Session
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      tenantId: string
      onboardingDone: boolean
    }
  }
  interface JWT {
    tenantId?: string
    onboardingDone?: boolean
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Login con Google: crear tenant + user + guardar tokens Gmail si no existe
      if (account?.provider === "google" && user.email) {
        try {
          let dbUser = await db.user.findUnique({
            where: { email: user.email },
          })

          if (!dbUser) {
            // Primer login con Google — crear tenant y usuario
            const tenant = await db.tenant.create({
              data: {
                name: user.name ?? user.email,
                config: {
                  assistantName: "KITT",
                  tone: "professional",
                  model: "claude-sonnet-4-5-20251001",
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

          // Guardar o actualizar tokens de Gmail
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
      // Al hacer login, enriquecer el token con tenantId y onboardingDone
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
      if (trigger === "update" && session) {
        if (session.onboardingDone !== undefined) {
          token.onboardingDone = session.onboardingDone
        }
      }

      return token
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? ""
        session.user.tenantId = token.tenantId as string
        session.user.onboardingDone = token.onboardingDone as boolean
      }
      return session
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
})
