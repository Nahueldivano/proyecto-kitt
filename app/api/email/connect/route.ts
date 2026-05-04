import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getAuthUrl } from "@/lib/gmail"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = await getAuthUrl()
    // Devolver la URL como JSON para que el cliente haga window.location.href
    return NextResponse.json({ url })
  } catch (error) {
    console.error("[email/connect] error:", error)
    return NextResponse.json({ error: "Error al iniciar conexión Gmail" }, { status: 500 })
  }
}
