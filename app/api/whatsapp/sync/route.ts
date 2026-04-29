import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findChats, findMessages } from "@/lib/evolution"

const MAX_MSGS_PER_CHAT = 50

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const diagnostics: string[] = []

  // Asegurar que la tabla existe antes de insertar
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
        "id"           TEXT  NOT NULL,
        "tenantId"     TEXT  NOT NULL,
        "externalId"   TEXT,
        "chatJid"      TEXT  NOT NULL,
        "contactName"  TEXT,
        "fromMe"       BOOLEAN NOT NULL DEFAULT false,
        "body"         TEXT  NOT NULL,
        "messageType"  TEXT  NOT NULL DEFAULT 'text',
        "timestamp"    TIMESTAMP(3) NOT NULL,
        "metadata"     JSONB NOT NULL DEFAULT '{}',
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
      )
    `)
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_externalId_key" ON "WhatsappMessage"("tenantId", "externalId")`
    )
    diagnostics.push("table OK")
  } catch (e) {
    diagnostics.push(`table error: ${e}`)
    return NextResponse.json({ error: "No se pudo crear la tabla", detail: String(e), diagnostics }, { status: 500 })
  }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const historyDays = Number(cfg.waHistoryDays ?? 30)
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

  const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)
  diagnostics.push(`historyDays=${historyDays}, since=${since.toISOString()}, whitelist=${JSON.stringify(whitelist)}`)

  try {
    // Traer mensajes en bloque desde Evolution
    const allMessages = await findMessages(tenantId, { limit: 2000 })
    diagnostics.push(`evolution returned ${allMessages.length} messages`)

    // Filtrar por ventana de tiempo
    const recent = allMessages.filter((m) => m.timestamp >= since)
    diagnostics.push(`after time filter: ${recent.length} messages`)

    // Filtrar por whitelist
    const filtered = whitelist.length > 0
      ? recent.filter((m) => whitelist.includes(m.chatJid))
      : recent
    diagnostics.push(`after whitelist filter: ${filtered.length} messages`)

    // Agrupar por chatJid, máx MAX_MSGS_PER_CHAT por chat
    const byChatJid = new Map<string, typeof filtered>()
    for (const msg of filtered) {
      const arr = byChatJid.get(msg.chatJid) ?? []
      if (arr.length < MAX_MSGS_PER_CHAT) arr.push(msg)
      byChatJid.set(msg.chatJid, arr)
    }
    diagnostics.push(`chats to sync: ${byChatJid.size}`)

    let totalSaved = 0
    let totalSkipped = 0
    const insertErrors: string[] = []

    for (const [jid, msgs] of byChatJid.entries()) {
      for (const msg of msgs) {
        if (!msg.externalId) { totalSkipped++; continue }
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
          const e = `[${jid}] ${err instanceof Error ? err.message : String(err)}`
          insertErrors.push(e)
          console.warn("[whatsapp/sync] insert error:", e)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      chatsProcessed: byChatJid.size,
      messagesSaved: totalSaved,
      messagesSkipped: totalSkipped,
      insertErrors: insertErrors.slice(0, 5),
      since: since.toISOString(),
      diagnostics,
    })
  } catch (err) {
    console.error("[whatsapp/sync] error:", err)
    return NextResponse.json({ error: String(err), diagnostics }, { status: 500 })
  }
}

// GET — devuelve los 20 chats más recientes para configurar whitelist
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
