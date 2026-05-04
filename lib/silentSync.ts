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

  const allMessages = await findMessages(tenantId, { limit: 5000 })
  const recent = allMessages.filter((m) => m.timestamp >= since)
  const filtered = whitelist.length > 0
    ? recent.filter((m) => whitelist.includes(m.chatJid))
    : recent

  for (const msg of filtered) {
    if (!msg.externalId) continue
    const isGroup = msg.chatJid.endsWith("@g.us")
    const contactName = isGroup ? (msg.contactName ?? null) : (msg.contactName ?? contactsMap.get(msg.chatJid) ?? null)
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
