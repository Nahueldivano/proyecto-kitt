import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeEvolutionMessage } from "@/lib/evolution"

// Webhook recibido de Evolution API — no requiere auth de usuario
// Evolution API envía eventos por cada mensaje entrante de WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const event = body?.event ?? body?.type
    const instanceName = body?.instance ?? body?.instanceName ?? ""

    // Extraer tenantId del nombre de instancia (kitt_{tenantId})
    const tenantId = instanceName.replace(/^kitt_/, "")
    if (!tenantId) return NextResponse.json({ ok: true })

    // Primero: actualizar estado de sesión para cualquier evento de conexión
    if (
      event === "connection.update" ||
      event === "CONNECTION_UPDATE" ||
      event === "status.instance" ||
      event === "STATUS_INSTANCE"
    ) {
      const state = body?.data?.state ?? body?.state
      if (state === "open" || state === "connected") {
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
      }
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

    // Normalizar mensaje desde el payload de Evolution
    const rawMessage =
      body?.data?.message ?? body?.data ?? body?.messages?.[0] ?? body?.message
    if (!rawMessage) return NextResponse.json({ ok: true })

    const msg = normalizeEvolutionMessage(rawMessage)
    if (!msg || !msg.body) return NextResponse.json({ ok: true })

    // Verificar whitelist del tenant antes de guardar
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
    const cfg = (tenant?.config ?? {}) as Record<string, unknown>
    const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []
    if (whitelist.length > 0 && !whitelist.includes(msg.chatJid)) {
      return NextResponse.json({ ok: true })
    }

    // Guardar en tabla dedicada WhatsappMessage (upsert por externalId)
    await db.$executeRawUnsafe(`
      INSERT INTO "WhatsappMessage"
        ("id","tenantId","externalId","chatJid","contactName","fromMe","body","messageType","timestamp","metadata","createdAt")
      VALUES
        (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, '{}', NOW())
      ON CONFLICT ("tenantId","externalId") WHERE "externalId" IS NOT NULL DO NOTHING
    `,
      tenantId,
      msg.externalId,
      msg.chatJid,
      msg.contactName,
      msg.fromMe,
      msg.body,
      msg.messageType,
      msg.timestamp,
    )

    // Actualizar estado de sesión a connected
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
