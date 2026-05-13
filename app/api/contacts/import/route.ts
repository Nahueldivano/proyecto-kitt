import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/contacts/import — importa contactos desde los chats sincronizados en WhatsappMessage
export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = session.user.tenantId

  // Obtener chats únicos con su mejor nombre disponible
  const rows = await db.$queryRawUnsafe<Array<{
    chatJid: string
    name: string | null
    isGroup: boolean
  }>>(`
    SELECT
      CASE
        WHEN "chatJid" LIKE '%@g.us' THEN "chatJid"
        ELSE regexp_replace("chatJid", '@.+$', '') || '@s.whatsapp.net'
      END AS "chatJid",
      COALESCE(
        (ARRAY_AGG("chatName" ORDER BY "timestamp" DESC) FILTER (WHERE "chatName" IS NOT NULL))[1],
        (ARRAY_AGG("contactName" ORDER BY "timestamp" DESC) FILTER (WHERE "contactName" IS NOT NULL AND "fromMe" = false))[1],
        (ARRAY_AGG("contactName" ORDER BY "timestamp" DESC) FILTER (WHERE "contactName" IS NOT NULL))[1]
      ) AS "name",
      ("chatJid" LIKE '%@g.us') AS "isGroup"
    FROM "WhatsappMessage"
    WHERE "tenantId" = $1
    GROUP BY "chatJid"
  `, tenantId)

  let created = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.chatJid || !row.chatJid.includes("@")) continue
    const isGroup = row.chatJid.endsWith("@g.us")
    const phone = isGroup ? null : row.chatJid.replace(/@[^@]+$/, "")
    // Nombre fallback: número de teléfono si no hay nombre
    const name = row.name?.trim() || phone || row.chatJid

    try {
      await db.contact.upsert({
        where: { tenantId_chatJid: { tenantId, chatJid: row.chatJid } },
        // Si ya existe, NO sobreescribir el nombre (el usuario puede haberlo editado)
        update: {},
        create: {
          tenantId,
          chatJid: row.chatJid,
          name,
          phone,
          isGroup,
          tags: [],
          syncEnabled: true,
        },
      })
      created++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ ok: true, created, skipped, total: rows.length })
}
