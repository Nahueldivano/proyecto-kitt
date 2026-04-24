import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Edge runtime — no usar auth() de next-auth acá, usar getToken()
export async function middleware(req: NextRequest) {
  const isSecure = req.nextUrl.protocol === "https:" || process.env.NEXTAUTH_URL?.startsWith("https:") || process.env.AUTH_URL?.startsWith("https:")
  const salt = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token"
  
  const token = await getToken({ 
    req, 
    secret: process.env.AUTH_SECRET,
    salt 
  })
  const { pathname } = req.nextUrl

  // Rutas internas — no requieren token de usuario (tienen su propia auth)
  if (pathname.startsWith("/api/internal/")) {
    return NextResponse.next()
  }

  // Rutas de auth pública — si ya está logueado, redirigir
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (token) {
      const dest = token.onboardingDone ? "/chat" : "/onboarding"
      return NextResponse.redirect(new URL(dest, req.url))
    }
    return NextResponse.next()
  }

  // Rutas protegidas — requieren login
  const protectedPaths = ["/chat", "/history", "/settings", "/onboarding", "/admin"]
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtected && !token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin — requiere email específico
  if (pathname.startsWith("/admin")) {
    const adminEmail = process.env.KITT_ADMIN_EMAIL
    if (!adminEmail || token?.email !== adminEmail) {
      return NextResponse.redirect(new URL("/chat", req.url))
    }
  }

  // Onboarding — si ya lo completó, redirigir al chat
  if (pathname.startsWith("/onboarding") && token?.onboardingDone) {
    return NextResponse.redirect(new URL("/chat", req.url))
  }

  // Chat/settings/history — si no completó onboarding, redirigir
  if (
    (pathname.startsWith("/chat") ||
      pathname.startsWith("/history") ||
      pathname.startsWith("/settings")) &&
    token &&
    !token.onboardingDone
  ) {
    return NextResponse.redirect(new URL("/onboarding", req.url))
  }

  return NextResponse.next()
}

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
