import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

interface ChatRow {
  chatJid: string
  chatName: string | null
  contactName: string | null
  messageCount: bigint | number
  lastMessageAt: Date
  lastMessageBody: string
}

interface MessageRow {
  id: string
  externalId: string | null
  chatJid: string
  chatName: string | null
  contactName: string | null
  fromMe: boolean
  body: string
  messageType: string
  timestamp: Date
  metadata: Record<string, unknown>
}

// Normaliza un JID al "canonical JID" para agrupar variantes del mismo contacto.
// Grupos (@g.us) quedan intactos. 1:1 se normalizan a <phone>@s.whatsapp.net.
// @lid y @c.us se tratan igual que @s.whatsapp.net.
function canonicalJid(jid: string): string {
  if (jid.endsWith("@g.us")) return jid
  const phone = jid.replace(/@.+$/, "")
  return `${phone}@s.whatsapp.net`
}

// GET /api/whatsapp/db
//   sin params → lista de chats agrupados por número canónico (top 100 por actividad)
//   ?chatJid=XXX → mensajes de ese chat (por número canónico, une variantes @s/@lid)
//   ?q=texto → filtra mensajes por contenido (todos los chats)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const tenantId = session.user.tenantId
  const { searchParams } = new URL(req.url)
  const chatJid = searchParams.get("chatJid")
  const q = searchParams.get("q")?.trim()

  try {
    if (chatJid) {
      // Agrupar variantes: para 1:1, buscar por número puro; para grupos, JID exacto
      let whereClause: string
      let params: unknown[]
      if (chatJid.endsWith("@g.us")) {
        whereClause = `"tenantId" = $1 AND "chatJid" = $2`
        params = [tenantId, chatJid]
      } else {
        const phone = chatJid.replace(/@.+$/, "")
        whereClause = `"tenantId" = $1 AND regexp_replace("chatJid", '@.+$', '') = $2`
        params = [tenantId, phone]
      }

      const messages = await db.$queryRawUnsafe<MessageRow[]>(
        `SELECT "id","externalId","chatJid","chatName","contactName","fromMe","body","messageType","timestamp","metadata"
         FROM "WhatsappMessage"
         WHERE ${whereClause}
         ORDER BY "timestamp" ASC
         LIMIT 500`,
        ...params,
      )
      return NextResponse.json({ messages })
    }

    if (q) {
      const messages = await db.$queryRawUnsafe<MessageRow[]>(
        `SELECT "id","externalId","chatJid","chatName","contactName","fromMe","body","messageType","timestamp","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "body" ILIKE $2
         ORDER BY "timestamp" DESC
         LIMIT 200`,
        tenantId,
        `%${q}%`,
      )
      return NextResponse.json({ messages })
    }

    // Lista de chats agrupados por JID canónico (número puro para 1:1, JID para grupos)
    // Esto unifica variantes @s.whatsapp.net, @lid, @c.us del mismo contacto
    const chats = await db.$queryRawUnsafe<ChatRow[]>(
      `WITH normalized AS (
         SELECT *,
           CASE
             WHEN "chatJid" LIKE '%@g.us' THEN "chatJid"
             ELSE regexp_replace("chatJid", '@.+$', '') || '@s.whatsapp.net'
           END AS "canonicalJid"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1
       )
       SELECT
         "canonicalJid" AS "chatJid",
         (SELECT n2."chatName" FROM normalized n2
          WHERE n2."canonicalJid" = n."canonicalJid"
            AND n2."chatName" IS NOT NULL
          ORDER BY n2."timestamp" DESC LIMIT 1) AS "chatName",
         COALESCE(
           (SELECT n2."contactName" FROM normalized n2
            WHERE n2."canonicalJid" = n."canonicalJid"
              AND n2."contactName" IS NOT NULL AND n2."fromMe" = false
            ORDER BY n2."timestamp" DESC LIMIT 1),
           (SELECT n2."contactName" FROM normalized n2
            WHERE n2."canonicalJid" = n."canonicalJid"
              AND n2."contactName" IS NOT NULL AND n2."fromMe" = true
            ORDER BY n2."timestamp" DESC LIMIT 1)
         ) AS "contactName",
         COUNT(*) AS "messageCount",
         MAX("timestamp") AS "lastMessageAt",
         (SELECT n3."body" FROM normalized n3
          WHERE n3."canonicalJid" = n."canonicalJid"
          ORDER BY n3."timestamp" DESC LIMIT 1) AS "lastMessageBody"
       FROM normalized n
       GROUP BY "canonicalJid"
       ORDER BY MAX("timestamp") DESC
       LIMIT 100`,
      tenantId,
    )

    const serialized = chats.map((c) => ({
      ...c,
      messageCount: Number(c.messageCount),
    }))

    const stats = await db.$queryRawUnsafe<{ total: bigint | number; audios: bigint | number; pendingAudios: bigint | number }[]>(
      `SELECT
         COUNT(*)::bigint AS total,
         COUNT(*) FILTER (WHERE "messageType" = 'audio')::bigint AS audios,
         COUNT(*) FILTER (WHERE "messageType" = 'audio' AND "body" = '[audio]')::bigint AS "pendingAudios"
       FROM "WhatsappMessage"
       WHERE "tenantId" = $1`,
      tenantId,
    )
    const s = stats[0] ?? { total: 0, audios: 0, pendingAudios: 0 }

    return NextResponse.json({
      chats: serialized,
      stats: {
        total: Number(s.total),
        audios: Number(s.audios),
        pendingAudios: Number(s.pendingAudios),
      },
    })
  } catch (err) {
    console.error("[whatsapp/db] error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
