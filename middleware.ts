import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { NextResponse } from "next/server"

/**
 * Middleware Edge-compatible: inicializado SOLO con authConfig (sin Prisma ni bcrypt).
 * NextAuth v5 split-config pattern: https://authjs.dev/guides/edge-compatibility
 */
const { auth } = NextAuth(authConfig)

export default auth(function middleware(req) {
  const { nextUrl } = req
  const { pathname } = nextUrl

  // req.auth es el objeto Session tal como lo devuelve el session callback
  const session = req.auth
  const isLoggedIn = !!session
  const user = session?.user as
    | { onboardingDone?: boolean; email?: string | null }
    | undefined
  const onboardingDone = user?.onboardingDone ?? false

  // ── Rutas internas (n8n, webhooks internos) ──────────────────
  if (pathname.startsWith("/api/internal/")) {
    return NextResponse.next()
  }

  // ── Rutas de auth pública ─────────────────────────────────────
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (isLoggedIn) {
      const dest = onboardingDone ? "/chat" : "/onboarding"
      return NextResponse.redirect(new URL(dest, nextUrl))
    }
    return NextResponse.next()
  }

  // ── Rutas protegidas — requieren login ────────────────────────
  const protectedPaths = ["/chat", "/history", "/settings", "/onboarding", "/admin"]
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Admin ─────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    const adminEmail = process.env.KITT_ADMIN_EMAIL
    if (!adminEmail || user?.email !== adminEmail) {
      return NextResponse.redirect(new URL("/chat", nextUrl))
    }
  }

  // ── Onboarding ya completado → chat ──────────────────────────
  if (pathname.startsWith("/onboarding") && isLoggedIn && onboardingDone) {
    return NextResponse.redirect(new URL("/chat", nextUrl))
  }

  // ── App sin onboarding → onboarding ──────────────────────────
  if (
    (pathname.startsWith("/chat") ||
      pathname.startsWith("/history") ||
      pathname.startsWith("/settings")) &&
    isLoggedIn &&
    !onboardingDone
  ) {
    return NextResponse.redirect(new URL("/onboarding", nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/chat/:path*",
    "/history/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/api/internal/:path*",
  ],
}
