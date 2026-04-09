import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chat, type ChatInput } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { message, conversationId } = await req.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 })
    }

    const tenantId = session.user.tenantId

    // Cargar historial de la conversación si existe
    let history: ChatInput[] = []
    if (conversationId) {
      const existing = await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 50, // Máximo 50 mensajes de contexto
      })
      history = existing.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    }

    // Agregar mensaje actual
    history.push({ role: "user", content: message })

    // Llamar a Claude
    const result = await chat(history, tenantId, conversationId ?? null)

    // Persistir mensajes en DB
    await db.message.createMany({
      data: [
        {
          conversationId: result.conversationId,
          role: "user",
          content: message,
        },
        {
          conversationId: result.conversationId,
          role: "assistant",
          content: result.message,
          type: result.artifact ? "artifact" : "text",
          metadata: result.pendingActionId
            ? JSON.parse(JSON.stringify({
                pendingActionId: result.pendingActionId,
                actionType: result.actionType ?? null,
                actionPayload: result.actionPayload ?? null,
              }))
            : {},
        },
      ],
    })

    return NextResponse.json({
      message: result.message,
      artifact: result.artifact,
      pendingActionId: result.pendingActionId,
      actionType: result.actionType,
      actionPayload: result.actionPayload,
      conversationId: result.conversationId,
    })
  } catch (error) {
    console.error("[chat] error:", error)

    // Mensaje amigable según el tipo de error
    const errMsg =
      error instanceof Error ? error.message : "Error desconocido"

    if (errMsg.includes("API key")) {
      return NextResponse.json(
        { error: "La API key de Anthropic no está configurada" },
        { status: 503 }
      )
    }

    if (errMsg.includes("Gmail no está conectado")) {
      return NextResponse.json(
        { error: "Gmail no está conectado. Configuralo en Ajustes." },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
