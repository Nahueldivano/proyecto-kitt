import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { sendEmail } from "@/lib/gmail"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { content, title } = await req.json()

    if (!content) {
      return NextResponse.json({ error: "Contenido requerido" }, { status: 400 })
    }

    // Obtener email del usuario conectado a Gmail
    const gmailConn = await db.gmailConnection.findUnique({
      where: { tenantId: session.user.tenantId },
      select: { email: true },
    })

    if (!gmailConn) {
      return NextResponse.json(
        { error: "Gmail no está conectado" },
        { status: 503 }
      )
    }

    await sendEmail(
      session.user.tenantId,
      gmailConn.email,
      title ?? "Documento de KITT",
      content
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[artifact/email] error:", error)
    return NextResponse.json({ error: "Error al enviar email" }, { status: 500 })
  }
}
