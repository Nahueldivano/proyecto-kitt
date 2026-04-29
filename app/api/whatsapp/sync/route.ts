import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findChats, findMessages } from "@/lib/evolution"

// POST /api/whatsapp/sync — importa mensajes desde Evolution API a WhatsappMessage.
// Respeta los filtros configurados por el tenant: ventana de tiempo + whitelist de contactos.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId

  // Configuración del tenant
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const historyDays = Number(cfg.waHistoryDays ?? 30)
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

  const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)

  try {
    // 1. Traer lista de chats disponibles en la instancia
    const chats = await findChats(tenantId)
    const activeChats = whitelist.length > 0
      ? chats.filter((c) => whitelist.includes(c.jid))
      : chats

    let totalSaved = 0
    const errors: string[] = []

    // 2. Para cada chat, traer mensajes dentro de la ventana de tiempo
    for (const chat of activeChats) {
      try {
        const msgs = await findMessages(tenantId, { chatJid: chat.jid, limit: 200 })
        const recent = msgs.filter((m) => m.timestamp >= since)

        for (const msg of recent) {
          if (!msg.externalId) continue
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
            msg.contactName ?? chat.name ?? null,
            msg.fromMe,
            msg.body,
            msg.messageType,
            msg.timestamp,
          )
          totalSaved++
        }
      } catch (err) {
        errors.push(`${chat.jid}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      chatsProcessed: activeChats.length,
      messagesSaved: totalSaved,
      since: since.toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error("[whatsapp/sync] error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET /api/whatsapp/sync — devuelve lista de chats disponibles para configurar whitelist
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
