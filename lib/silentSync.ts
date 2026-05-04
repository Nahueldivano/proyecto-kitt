import { db } from "@/lib/db"
import { findContacts, findGroupNames, findMessages, getStatus } from "@/lib/evolution"

export async function silentSync(tenantId: string): Promise<void> {
  const status = await getStatus(tenantId)
  if (status !== "connected") return

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const historyDays = Number(cfg.waHistoryDays ?? 7)
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

  const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)

  const [contactsMap, groupNamesMap] = await Promise.all([
    findContacts(tenantId),
    findGroupNames(tenantId),
  ])

  // Actualizar chatName retroactivo para grupos existentes
  for (const [jid, name] of groupNamesMap.entries()) {
    await db.$executeRawUnsafe(
      `UPDATE "WhatsappMessage" SET "chatName" = $1 WHERE "tenantId" = $2 AND "chatJid" = $3 AND "chatName" IS NULL`,
      name, tenantId, jid
    ).catch(() => {})
  }

  // Corregir contactName en chats 1:1:
  // - Si tenemos nombre de agenda: usarlo para TODOS los mensajes del chat
  // - Si NO tenemos nombre de agenda: limpiar contactName de mensajes fromMe=true
  //   (ese nombre es el del tenant, no el del contacto)
  const allJids = await db.$queryRawUnsafe<Array<{ chatJid: string }>>(
    `SELECT DISTINCT "chatJid" FROM "WhatsappMessage"
     WHERE "tenantId" = $1 AND "chatJid" NOT LIKE '%@g.us'`,
    tenantId
  ).catch(() => [] as Array<{ chatJid: string }>)

  for (const { chatJid } of allJids as Array<{ chatJid: string }>) {
    const phone = chatJid.replace(/@.+$/, "")
    const agendaName = contactsMap.get(chatJid) ?? contactsMap.get(phone) ?? null
    if (agendaName) {
      // Tenemos nombre de agenda → aplicar a todos los mensajes del chat
      await db.$executeRawUnsafe(
        `UPDATE "WhatsappMessage" SET "contactName" = $1
         WHERE "tenantId" = $2 AND regexp_replace("chatJid", '@.+$', '') = $3
           AND ("contactName" IS NULL OR "contactName" != $1)`,
        agendaName, tenantId, phone
      ).catch(() => {})
    } else {
      // Sin nombre de agenda → limpiar contactName de mensajes propios (fromMe=true)
      // El nombre en esos mensajes es el del tenant, no del contacto
      await db.$executeRawUnsafe(
        `UPDATE "WhatsappMessage" SET "contactName" = NULL
         WHERE "tenantId" = $1 AND regexp_replace("chatJid", '@.+$', '') = $2
           AND "fromMe" = true AND "contactName" IS NOT NULL`,
        tenantId, phone
      ).catch(() => {})
    }
  }

  const allMessages = await findMessages(tenantId, { limit: 5000 })
  const recent = allMessages.filter((m) => m.timestamp >= since)
  const filtered = whitelist.length > 0
    ? recent.filter((m) => whitelist.includes(m.chatJid))
    : recent

  for (const msg of filtered) {
    if (!msg.externalId) continue
    const isGroup = msg.chatJid.endsWith("@g.us")
    const contactName = isGroup
      ? (msg.contactName ?? null)
      : (contactsMap.get(msg.chatJid) ?? (!msg.fromMe ? msg.contactName : null) ?? null)
    const chatName = isGroup ? (groupNamesMap.get(msg.chatJid) ?? null) : null
    const metadata = msg.messageType === "audio"
      ? JSON.stringify({ messageKey: msg.messageKey, transcribed: false })
      : "{}"

    await db.$executeRawUnsafe(`
      INSERT INTO "WhatsappMessage"
        ("id","tenantId","externalId","chatJid","contactName","chatName","fromMe","body","messageType","timestamp","metadata","createdAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT ("tenantId","externalId") WHERE "externalId" IS NOT NULL DO NOTHING
    `, tenantId, msg.externalId, msg.chatJid, contactName, chatName,
       msg.fromMe, msg.body, msg.messageType, msg.timestamp, metadata
    ).catch(() => {})
  }
}
