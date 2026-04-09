import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyInternalKey } from "@/lib/internal-auth"

export async function POST(req: NextRequest) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { tenantId, from, content, messageType = "text" } = await req.json()

    if (!tenantId || !content) {
      return NextResponse.json(
        { error: "tenantId y content son requeridos" },
        { status: 400 }
      )
    }

    // Buscar o crear conversación
    let conversation = await db.conversation.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    })

    if (!conversation) {
      conversation = await db.conversation.create({ data: { tenantId } })
    }

    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content,
        type: "text",
        metadata: {
          source: "whatsapp",
          from: from ?? "unknown",
          messageType,
        },
      },
    })

    return NextResponse.json({ id: message.id, success: true }, { status: 201 })
  } catch (error) {
    console.error("[internal/wa-message] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
