import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendEmail, replyToEmail } from "@/lib/gmail"
import { sendTextMessage } from "@/lib/evolution"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { taskIds } = (await req.json()) as { taskIds: string[] }
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: "taskIds requerido" }, { status: 400 })
    }

    const tenantId = session.user.tenantId
    const results: { id: string; status: "approved" | "error"; error?: string }[] = []

    for (const id of taskIds) {
      let actionType = ""
      try {
        const action = await db.pendingAction.findUnique({ where: { id } })
        if (!action || action.tenantId !== tenantId) {
          results.push({ id, status: "error", error: "No encontrada" })
          continue
        }
        if (action.status !== "pending") {
          results.push({ id, status: "error", error: "Ya procesada" })
          continue
        }

        actionType = action.type
        const payload = action.payload as Record<string, string>

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
            results.push({ id, status: "error", error: "Tipo desconocido" })
            continue
        }

        await db.pendingAction.update({
          where: { id },
          data: { status: "approved" },
        })
        results.push({ id, status: "approved" })
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Error desconocido"
        console.error(`[actions/batch/approve] ${id}:`, raw)
        // Mensaje legible según tipo de error
        let userMsg = "No se pudo enviar. Intentalo de nuevo."
        if (actionType === "send_whatsapp_message") {
          if (raw.includes("exists\":false") || raw.includes("400")) {
            userMsg = "Contacto no disponible en WhatsApp."
          } else if (raw.includes("401") || raw.includes("403")) {
            userMsg = "WhatsApp desconectado."
          }
        }
        results.push({ id, status: "error", error: userMsg })
        await db.pendingAction.update({
          where: { id },
          data: { status: "failed" },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[actions/batch/approve] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
