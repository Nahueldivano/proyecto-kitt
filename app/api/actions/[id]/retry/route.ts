import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail, replyToEmail } from "@/lib/gmail"
import { sendTextMessage } from "@/lib/evolution"

function friendlyError(raw: string, type: string): string {
  if (type === "send_whatsapp_message") {
    if (raw.includes("resolver el número") || raw.includes("sincronizar")) {
      return raw
    }
    if (raw.includes("exists\":false") || raw.includes("400")) {
      return "No se pudo enviar el mensaje. El contacto no está disponible en WhatsApp o el número es incorrecto."
    }
    if (raw.includes("401") || raw.includes("403")) {
      return "WhatsApp no está conectado. Reconectalo desde Configuración → Conexiones."
    }
  }
  if (type.includes("email")) {
    if (raw.includes("401") || raw.includes("invalid")) {
      return "Gmail no está conectado. Reconectalo desde Configuración → Conexiones."
    }
  }
  return "No se pudo ejecutar la acción. Intentalo de nuevo."
}

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

    const action = await db.pendingAction.findUnique({ where: { id } })
    if (!action) {
      return NextResponse.json({ error: "Acción no encontrada" }, { status: 404 })
    }
    if (action.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (action.status !== "failed") {
      return NextResponse.json(
        { error: "Solo se pueden reintentar acciones fallidas" },
        { status: 409 }
      )
    }

    const payload = action.payload as Record<string, string>

    try {
      switch (action.type) {
        case "send_email":
          await sendEmail(tenantId, payload.to, payload.subject, payload.body)
          break
        case "reply_email":
          await replyToEmail(tenantId, payload.threadId, payload.to, payload.subject, payload.body)
          break
        case "send_whatsapp_message":
          await sendTextMessage(tenantId, payload.to, payload.message)
          break
        default:
          return NextResponse.json({ error: "Tipo de acción desconocido" }, { status: 400 })
      }
    } catch (execErr) {
      const raw = execErr instanceof Error ? execErr.message : String(execErr)
      const friendly = friendlyError(raw, action.type)
      await db.pendingAction.update({
        where: { id },
        data: { status: "failed", errorMessage: friendly, executedAt: new Date() },
      }).catch(() => {})
      console.error("[actions/retry] exec error:", raw)
      return NextResponse.json({ error: friendly }, { status: 500 })
    }

    await db.pendingAction.update({
      where: { id },
      data: { status: "approved", errorMessage: null, executedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[actions/retry] error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
