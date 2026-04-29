import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findChats, findMessages } from "@/lib/evolution"

const MAX_MSGS_PER_CHAT = 50

// POST /api/whatsapp/sync — importa mensajes desde Evolution API.
// Estrategia en bloque: una sola llamada a Evolution, luego filtra y agrupa en código.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const historyDays = Number(cfg.waHistoryDays ?? 30)
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

  const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)

  try {
    // Una sola llamada: pedimos los mensajes más recientes en bloque
    const allMessages = await findMessages(tenantId, { limit: 2000 })

    // Filtrar por ventana de tiempo
    const recent = allMessages.filter((m) => m.timestamp >= since)

    // Filtrar por whitelist (si hay)
    const filtered = whitelist.length > 0
      ? recent.filter((m) => whitelist.includes(m.chatJid))
      : recent

    // Agrupar por chatJid y limitar a MAX_MSGS_PER_CHAT por chat
    const byChatJid = new Map<string, typeof filtered>()
    for (const msg of filtered) {
      const arr = byChatJid.get(msg.chatJid) ?? []
      if (arr.length < MAX_MSGS_PER_CHAT) arr.push(msg)
      byChatJid.set(msg.chatJid, arr)
    }

    let totalSaved = 0
    const chatsProcessed = byChatJid.size

    for (const msgs of byChatJid.values()) {
      for (const msg of msgs) {
        if (!msg.externalId) continue
        try {
          await db.$executeRawUnsafe(`
            INSERT INTO "WhatsappMessage"
              ("id","tenantId","externalId","chatJid","contactName","fromMe","body","messageType","timestamp","metadata","createdAt")
            VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, '{}', NOW())
            ON CONFLICT ("tenantId","externalId") DO NOTHING
          `,
            tenantId,
            msg.externalId,
            msg.chatJid,
            msg.contactName ?? null,
            msg.fromMe,
            msg.body,
            msg.messageType,
            msg.timestamp,
          )
          totalSaved++
        } catch (err) {
          console.warn("[whatsapp/sync] upsert error:", err)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      chatsProcessed,
      messagesSaved: totalSaved,
      since: since.toISOString(),
    })
  } catch (err) {
    console.error("[whatsapp/sync] error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET /api/whatsapp/sync — devuelve los 20 chats más recientes para configurar whitelist
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const chats = await findChats(session.user.tenantId)
    return NextResponse.json({ chats })
  } catch (err) {
    console.error("[whatsapp/sync] GET error:", err)
    return NextResponse.json({ chats: [] })
  }
}
