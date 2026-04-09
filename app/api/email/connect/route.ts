import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getAuthUrl } from "@/lib/gmail"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const authUrl = await getAuthUrl()
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error("[email/connect] error:", error)
    return NextResponse.json({ error: "Error al iniciar conexión Gmail" }, { status: 500 })
  }
}
