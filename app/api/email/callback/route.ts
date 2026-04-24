import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"
import { db } from "@/lib/db"
import { getOAuthClient } from "@/lib/gmail"
import { encrypt } from "@/lib/crypto"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error || !code) {
    return NextResponse.redirect(
      new URL("/settings?error=gmail_denied", req.url)
    )
  }

  try {
    const client = await getOAuthClient()
    const { tokens } = await client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Tokens incompletos")
    }

    // Obtener email de la cuenta
    client.setCredentials(tokens)
    const gmail = google.gmail({ version: "v1", auth: client })
    const profile = await gmail.users.getProfile({ userId: "me" })
    const email = profile.data.emailAddress ?? ""

    // Guardar conexión (tokens encriptados)
    await db.gmailConnection.upsert({
      where: { tenantId: session.user.tenantId },
      update: {
        email,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        connectedAt: new Date(),
      },
      create: {
        tenantId: session.user.tenantId,
        email,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
      },
    })

    return NextResponse.redirect(new URL("/settings?gmail=connected", req.url))
  } catch (error) {
    console.error("[email/callback] error:", error)
    return NextResponse.redirect(
      new URL("/settings?error=gmail_failed", req.url)
    )
  }
}
