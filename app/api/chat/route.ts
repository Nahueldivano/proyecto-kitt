import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatStream, type ChatInput, type StreamChunk } from "@/lib/claude"
import type { Artifact } from "@/lib/store"

const MAX_MESSAGE_LENGTH = 32_000

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

    if (conversationId) {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        select: { tenantId: true },
      })
      if (!conv) return NextResponse.json({ error: "No encontrada" }, { status: 404 })
      if (conv.tenantId !== tenantId) return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
    }

    // Cargar historial
    let history: ChatInput[] = []
    if (conversationId) {
      const existing = await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
      history = existing.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
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

    let finalMessage = ""
    let finalConvId = conversationId ?? ""
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
            conversationId ?? null,
            (chunk) => {
              if (chunk.type === "text") finalMessage += chunk.text
              else if (chunk.type === "artifact") artifact = chunk.artifact
              else if (chunk.type === "pending_action") {
                pendingActionId = chunk.pendingActionId
                actionType = chunk.actionType
                actionPayload = chunk.actionPayload
              } else if (chunk.type === "done") {
                finalConvId = chunk.conversationId
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
                        metadata: (pendingActionId ? { pendingActionId, actionType, actionPayload } : {}) as any,
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
          console.error("[chat] error:", err)
          let clientMsg = "Error interno del servidor"
          if (errMsg.includes("API key")) clientMsg = "La API key de Anthropic no está configurada"
          else if (errMsg.includes("Gmail")) clientMsg = "Gmail no está conectado."
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
