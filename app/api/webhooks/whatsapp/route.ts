import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Webhook recibido de Evolution API — no requiere auth de usuario
// Evolution API envía eventos por cada mensaje entrante
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Evolution API puede enviar distintos tipos de eventos
    const event = body?.event ?? body?.type
    const instanceName = body?.instance ?? body?.instanceName ?? ""

    // Extraer tenantId del nombre de instancia (kitt_{tenantId})
    const tenantId = instanceName.replace(/^kitt_/, "")
    if (!tenantId) {
      return NextResponse.json({ ok: true })
    }

    // Solo procesar mensajes entrantes
    if (
      event !== "messages.upsert" &&
      event !== "message" &&
      event !== "MESSAGES_UPSERT"
    ) {
      return NextResponse.json({ ok: true })
    }

    // Normalizar datos del mensaje según versión de Evolution API
    const messageData =
      body?.data?.message ?? body?.messages?.[0] ?? body?.data ?? body?.message

    if (!messageData) {
      return NextResponse.json({ ok: true })
    }

    const fromMe = messageData?.key?.fromMe ?? messageData?.fromMe ?? false
    if (fromMe) return NextResponse.json({ ok: true })

    const from =
      messageData?.key?.remoteJid ??
      messageData?.from ??
      messageData?.remoteJid ??
      "unknown"

    const textContent =
      messageData?.message?.conversation ??
      messageData?.message?.extendedTextMessage?.text ??
      messageData?.text ??
      messageData?.body ??
      ""

    const messageType =
      messageData?.message?.audioMessage ? "audio" :
      messageData?.message?.imageMessage ? "image" :
      messageData?.message?.documentMessage ? "document" :
      "text"

    if (!textContent && messageType === "text") {
      return NextResponse.json({ ok: true })
    }

    // Buscar o crear conversación del tenant
    let conversation = await db.conversation.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    })

    if (!conversation) {
      conversation = await db.conversation.create({ data: { tenantId } })
    }

    // Guardar mensaje en DB
    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: textContent || `[${messageType}]`,
        type: "text",
        metadata: {
          source: "whatsapp",
          from,
          messageType,
          rawData: { instanceName },
        },
      },
    })

    // Actualizar estado de la sesión WA a connected
    await db.whatsappSession.upsert({
      where: { tenantId },
      update: { status: "connected", connectedAt: new Date() },
      create: {
        tenantId,
        status: "connected",
        instanceName: `kitt_${tenantId}`,
        connectedAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[webhooks/whatsapp] error:", error)
    return NextResponse.json({ ok: true }) // Siempre 200 para evitar retries infinitos
  }
}
