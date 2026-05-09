import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail, replyToEmail } from "@/lib/gmail"
import { sendTextMessage } from "@/lib/evolution"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const tenantId = session.user.tenantId

    // Buscar la acción y verificar que pertenece al tenant
    const action = await db.pendingAction.findUnique({ where: { id } })

    if (!action) {
      return NextResponse.json({ error: "Acción no encontrada" }, { status: 404 })
    }

    if (action.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (action.status !== "pending") {
      return NextResponse.json(
        { error: "La acción ya fue procesada" },
        { status: 409 }
      )
    }

    const payload = action.payload as Record<string, string>

    // Ejecutar la acción según su tipo
    switch (action.type) {
      case "send_email":
        await sendEmail(tenantId, payload.to, payload.subject, payload.body)
        break

      case "reply_email":
        await replyToEmail(
          tenantId,
          payload.threadId,
          payload.to,
          payload.subject,
          payload.body
        )
        break

      case "send_whatsapp_message":
        await sendTextMessage(tenantId, payload.to, payload.message)
        break

      default:
        return NextResponse.json({ error: "Tipo de acción desconocido" }, { status: 400 })
    }

    // Marcar como aprobada
    await db.pendingAction.update({
      where: { id },
      data: { status: "approved" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[actions/approve] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
