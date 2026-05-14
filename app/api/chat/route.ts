import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatStream, type ChatInput, type StreamChunk } from "@/lib/claude"
import type { Artifact } from "@/lib/store"

// Mensajes muy grandes (documentos pegados) sí permitidos: KITT analiza docs largos.
// 500K caracteres ≈ 100 páginas de texto. Lo que no entre en context window lo corta Claude.
const MAX_MESSAGE_LENGTH = 500_000

// Cuántos mensajes previos del chat se mandan como contexto a Claude.
// Memoria por conversación: independiente entre chats, acotada para no inflar costos.
const MAX_HISTORY_MESSAGES = 20

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { message, conversationId, model: modelOverride, webSearch, fileContents } = body as {
      message: unknown
      conversationId?: string
      model?: string
      webSearch?: boolean
      fileContents?: Array<{ name: string; content: string; type: string }>
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Mensaje demasiado largo" }, { status: 400 })
    }

    const tenantId = session.user.tenantId

    // Validar conversationId si vino: si no existe en DB (cliente con state stale),
    // lo ignoramos y dejamos que chatStream cree una conversación nueva.
    // Si existe pero es de otro tenant, sí cortamos por seguridad.
    let validConversationId: string | undefined = conversationId
    if (conversationId) {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { tenantId: true },
      })
      if (!conv) {
        validConversationId = undefined
      } else if (conv.tenantId !== tenantId) {
        return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
      }
    }

    // Cargar historial
    let history: ChatInput[] = []
    if (validConversationId) {
      // Memoria por chat: últimos N mensajes del chat con KITT, en orden cronológico.
      // Los mensajes de WhatsApp van a su propia tabla (WhatsappMessage) y no se mezclan acá.
      const recent = await db.message.findMany({
        where: { conversationId: validConversationId },
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY_MESSAGES,
      })
      history = recent
        .reverse()
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)

      // Anthropic exige que el primer mensaje sea 'user' y que los roles alternen.
      history = history.filter((msg, i, arr) => {
        if (i === 0) return true
        return msg.role !== arr[i - 1].role
      })
      while (history.length > 0 && history[0].role !== "user") {
        history.shift()
      }
    }

    // Construir mensaje del usuario con archivos adjuntos si los hay
    let userContent = message
    if (fileContents && fileContents.length > 0) {
      const filesText = fileContents
        .map((f) => `\n\n--- Archivo: ${f.name} ---\n${f.content}\n--- Fin de ${f.name} ---`)
        .join("")
      userContent = message + filesText
    }
    history.push({ role: "user", content: userContent })

    // Detección de confirmación conversacional: si el usuario dice "sí/dale/ok/enviar"
    // y hay acciones pendientes del último mensaje del asistente, ejecutarlas directamente.
    if (validConversationId) {
      const confirmWords = /^(s[ií]|dale|ok|okay|adelante|enviar?|manda(lo)?|confirmar?|perfecto|listo|va|bueno|claro|sí envía|sí manda)\b/i
      if (confirmWords.test(message.trim())) {
        const lastAssistant = await db.message.findFirst({
          where: { conversationId: validConversationId, role: "assistant" },
          orderBy: { createdAt: "desc" },
          select: { metadata: true },
        })
        const meta = (lastAssistant?.metadata ?? {}) as Record<string, unknown>
        const pendingIds: string[] = []

        if (meta.pendingActionId) pendingIds.push(String(meta.pendingActionId))
        if (meta.batchTasks && Array.isArray(meta.batchTasks)) {
          for (const t of meta.batchTasks as Array<{ id: string }>) {
            if (t.id) pendingIds.push(t.id)
          }
        }

        if (pendingIds.length > 0) {
          // Ejecutar las acciones pendientes
          const { sendEmail, replyToEmail } = await import("@/lib/gmail")
          const { sendTextMessage } = await import("@/lib/evolution")
          const results: string[] = []

          for (const id of pendingIds) {
            try {
              const action = await db.pendingAction.findUnique({ where: { id } })
              if (!action || action.tenantId !== tenantId || action.status !== "pending") continue
              const p = action.payload as Record<string, string>
              if (action.type === "send_whatsapp_message") await sendTextMessage(tenantId, p.to, p.message)
              else if (action.type === "send_email") await sendEmail(tenantId, p.to, p.subject, p.body)
              else if (action.type === "reply_email") await replyToEmail(tenantId, p.threadId, p.to, p.subject, p.body)
              await db.pendingAction.update({ where: { id }, data: { status: "approved" } })
              results.push("ok")
            } catch {
              results.push("error")
            }
          }

          const sent = results.filter((r) => r === "ok").length
          const failed = results.filter((r) => r === "error").length
          const replyText = failed === 0
            ? `Listo, ${sent === 1 ? "mensaje enviado" : `${sent} mensajes enviados`}.`
            : `${sent} enviado${sent !== 1 ? "s" : ""}, ${failed} no se pudo${failed !== 1 ? "n" : ""} enviar.`

          const encoder2 = new TextEncoder()
          const quickStream = new ReadableStream({
            start(ctrl) {
              ctrl.enqueue(encoder2.encode(`data: ${JSON.stringify({ type: "text", text: replyText })}\n\n`))
              ctrl.enqueue(encoder2.encode(`data: ${JSON.stringify({ type: "done", conversationId: validConversationId })}\n\n`))
              ctrl.close()
            }
          })
          return new Response(quickStream, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" },
          })
        }
      }
    }

    // Los mensajes entrantes de WhatsApp se insertan en tiempo real vía webhook,
    // así que no sincronizamos contra Evolution acá. Si el usuario quiere refrescar,
    // pide explícitamente y el modelo usa la tool sync_whatsapp.

    let finalMessage = ""
    let artifact: Artifact | undefined
    let pendingActionId: string | undefined
    let actionType: string | undefined
    let actionPayload: Record<string, unknown> | undefined

    const encoder = new TextEncoder()
    const send = (chunk: StreamChunk | { type: "error"; message: string }) =>
      encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await chatStream(
            history,
            tenantId,
            validConversationId ?? null,
            (chunk) => {
              if (chunk.type === "text") finalMessage += chunk.text
              else if (chunk.type === "artifact") artifact = chunk.artifact
              else if (chunk.type === "pending_action") {
                pendingActionId = chunk.pendingActionId
                actionType = chunk.actionType
                actionPayload = chunk.actionPayload
              } else if (chunk.type === "done") {
                db.message
                  .createMany({
                    data: [
                      { conversationId: chunk.conversationId, role: "user", content: userContent },
                      {
                        conversationId: chunk.conversationId,
                        role: "assistant",
                        content: finalMessage || "Procesé tu solicitud.",
                        type: artifact ? "artifact" : "text",
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        metadata: ({
                          ...(pendingActionId ? { pendingActionId, actionType, actionPayload } : {}),
                          ...(artifact ? { artifact } : {}),
                        }) as any,
                      },
                    ],
                  })
                  .catch((err) => console.error("[chat] persist error:", err))
              }
              controller.enqueue(send(chunk))
            },
            undefined,
            { modelOverride, webSearch }
          )
          controller.close()
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Error desconocido"
          const stack = err instanceof Error ? err.stack : undefined
          console.error("[chat] stream error:", errMsg, "\nSTACK:", stack, "\nRAW:", err)
          let clientMsg = errMsg
          if (
            errMsg.includes("authentication_error") ||
            errMsg.includes("invalid x-api-key") ||
            errMsg.includes("API key") ||
            errMsg.includes("api_key") ||
            errMsg.includes("401")
          ) {
            clientMsg = "La API key de Anthropic es inválida o está vencida. Andá a Configuración → Asistente y actualizala (regenerala en console.anthropic.com si hace falta)."
          } else if (errMsg.includes("Gmail")) {
            clientMsg = "Gmail no está conectado."
          } else if (errMsg.includes("rate_limit") || errMsg.includes("429")) {
            clientMsg = "Anthropic rate limit alcanzado. Esperá un momento e intentá de nuevo."
          }
          controller.enqueue(send({ type: "error", message: clientMsg }))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("[chat] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
