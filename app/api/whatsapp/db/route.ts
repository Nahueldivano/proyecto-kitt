import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

interface ChatRow {
  chatJid: string
  contactName: string | null
  messageCount: bigint | number
  lastMessageAt: Date
  lastMessageBody: string
}

interface MessageRow {
  id: string
  externalId: string | null
  chatJid: string
  contactName: string | null
  fromMe: boolean
  body: string
  messageType: string
  timestamp: Date
  metadata: Record<string, unknown>
}

// GET /api/whatsapp/db
//   sin params → lista de chats agrupados (top 100 por última actividad)
//   ?chatJid=XXX → mensajes de ese chat (orden ascendente, máx 500)
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
      const messages = await db.$queryRawUnsafe<MessageRow[]>(
        `SELECT "id","externalId","chatJid","contactName","fromMe","body","messageType","timestamp","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "chatJid" = $2
         ORDER BY "timestamp" ASC
         LIMIT 500`,
        tenantId,
        chatJid,
      )
      return NextResponse.json({ messages })
    }

    if (q) {
      const messages = await db.$queryRawUnsafe<MessageRow[]>(
        `SELECT "id","externalId","chatJid","contactName","fromMe","body","messageType","timestamp","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "body" ILIKE $2
         ORDER BY "timestamp" DESC
         LIMIT 200`,
        tenantId,
        `%${q}%`,
      )
      return NextResponse.json({ messages })
    }

    // Lista de chats agrupados
    const chats = await db.$queryRawUnsafe<ChatRow[]>(
      `SELECT
         "chatJid",
         (SELECT "contactName" FROM "WhatsappMessage" m2
          WHERE m2."tenantId" = m1."tenantId" AND m2."chatJid" = m1."chatJid"
            AND m2."contactName" IS NOT NULL
          ORDER BY m2."timestamp" DESC LIMIT 1) AS "contactName",
         COUNT(*) AS "messageCount",
         MAX("timestamp") AS "lastMessageAt",
         (SELECT "body" FROM "WhatsappMessage" m3
          WHERE m3."tenantId" = m1."tenantId" AND m3."chatJid" = m1."chatJid"
          ORDER BY m3."timestamp" DESC LIMIT 1) AS "lastMessageBody"
       FROM "WhatsappMessage" m1
       WHERE "tenantId" = $1
       GROUP BY "chatJid", "tenantId"
       ORDER BY MAX("timestamp") DESC
       LIMIT 100`,
      tenantId,
    )

    // Convertir BigInt a Number para serialización
    const serialized = chats.map((c) => ({
      ...c,
      messageCount: Number(c.messageCount),
    }))

    // Estadísticas globales
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
