import type { NextAuthConfig } from "next-auth"

// Type augmentation must live here so both middleware.ts and auth.ts pick it up
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

/**
 * Edge-compatible auth config — no Prisma, no bcrypt, no Node.js-only APIs.
 * Used directly by middleware.ts and merged into auth.ts.
 */
export default {
  trustHost: true,

  providers: [], // providers reales se inyectan en auth.ts (Node.js)

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },

  callbacks: {
    jwt({ token, trigger, session }) {
      // Edge-safe: solo lee del token ya poblado.
      // El enriquecimiento inicial (tenantId, onboardingDone) lo hace auth.ts
      // en el callback jwt completo que corre en Node.js durante el sign-in.
      if (trigger === "update" && session?.onboardingDone !== undefined) {
        token.onboardingDone = session.onboardingDone
      }
      return token
    },

    session({ session, token }) {
      if (token) {
        session.user.id = token.sub ?? ""
        session.user.tenantId = token.tenantId as string
        session.user.onboardingDone = token.onboardingDone as boolean
      }
      return session
    },
  },
} satisfies NextAuthConfig
