import { db } from "@/lib/db"
import { findContacts, findGroupNames, findMessages, getStatus } from "@/lib/evolution"

export async function silentSync(tenantId: string): Promise<void> {
  const status = await getStatus(tenantId)
  if (status !== "connected") return

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const historyDays = Number(cfg.waHistoryDays ?? 7)

  const since = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)

  const [contactsMap, groupNamesMap] = await Promise.all([
    findContacts(tenantId),
    findGroupNames(tenantId),
  ])

  // Auto-guardar contactos nuevos detectados (silencioso, no bloquea)
  for (const [jid, name] of contactsMap.entries()) {
    if (!jid.includes("@") || jid.endsWith("@g.us")) continue
    const isLid = jid.endsWith("@lid") || jid.endsWith("@c.us")
    const rawPhone = isLid ? null : jid.replace(/@.+$/, "")
    // No guardar como phone si tiene >13 dígitos (es un lid disfrazado como @s.whatsapp.net)
    const phone = rawPhone && rawPhone.length <= 13 ? rawPhone : null
    db.contact.findFirst({ where: { tenantId, OR: [{ chatJid: jid }, ...(phone ? [{ phone }] : [])] }, select: { id: true } })
      .then(existing => {
        if (!existing) db.contact.create({ data: { tenantId, chatJid: jid, name, phone: phone ?? null, isGroup: false, tags: [], syncEnabled: true } }).catch(() => {})
      }).catch(() => {})
  }
  for (const [jid, name] of groupNamesMap.entries()) {
    db.contact.findFirst({ where: { tenantId, chatJid: jid }, select: { id: true } })
      .then(existing => {
        if (!existing) db.contact.create({ data: { tenantId, chatJid: jid, name, isGroup: true, tags: [], syncEnabled: true } }).catch(() => {})
      }).catch(() => {})
  }

  // Cargar contactos guardados en la tabla Contact para:
  // 1. Priorizar sus nombres sobre los de Evolution
  // 2. Filtrar por syncEnabled si hay contactos guardados
  const savedContacts = await db.contact.findMany({
    where: { tenantId },
    select: { chatJid: true, phone: true, name: true, syncEnabled: true },
  }).catch(() => [] as Array<{ chatJid: string; phone: string | null; name: string; syncEnabled: boolean }>)

  // Mapa de JID/phone → nombre del Contact guardado (tiene prioridad máxima)
  const contactNameOverride = new Map<string, string>()
  const syncEnabledJids = new Set<string>()
  for (const c of savedContacts) {
    contactNameOverride.set(c.chatJid, c.name)
    if (c.phone) contactNameOverride.set(c.phone, c.name)
    if (c.syncEnabled) {
      syncEnabledJids.add(c.chatJid)
      if (c.phone) syncEnabledJids.add(c.phone)
    }
  }

  const hasSavedContacts = savedContacts.length > 0

  // Actualizar chatName retroactivo para grupos
  for (const [jid, name] of groupNamesMap.entries()) {
    await db.$executeRawUnsafe(
      `UPDATE "WhatsappMessage" SET "chatName" = $1 WHERE "tenantId" = $2 AND "chatJid" = $3 AND "chatName" IS NULL`,
      name, tenantId, jid
    ).catch(() => {})
  }

  // Corregir contactName en chats 1:1 usando Contact primero, luego agenda de Evolution
  const allJids = await db.$queryRawUnsafe<Array<{ chatJid: string }>>(
    `SELECT DISTINCT "chatJid" FROM "WhatsappMessage" WHERE "tenantId" = $1 AND "chatJid" NOT LIKE '%@g.us'`,
    tenantId
  ).catch(() => [] as Array<{ chatJid: string }>)

  for (const { chatJid } of allJids as Array<{ chatJid: string }>) {
    const phone = chatJid.replace(/@.+$/, "")
    // Prioridad: Contact guardado > agenda Evolution > limpiar si es propio
    const bestName = contactNameOverride.get(chatJid) ?? contactNameOverride.get(phone)
      ?? contactsMap.get(chatJid) ?? contactsMap.get(phone) ?? null
    if (bestName) {
      await db.$executeRawUnsafe(
        `UPDATE "WhatsappMessage" SET "contactName" = $1
         WHERE "tenantId" = $2 AND regexp_replace("chatJid", '@.+$', '') = $3
           AND ("contactName" IS NULL OR "contactName" != $1)`,
        bestName, tenantId, phone
      ).catch(() => {})
    } else {
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

  // Filtrar por syncEnabled de Contact (si hay contactos guardados)
  // Si no hay contactos aún, sincronizar todo (comportamiento inicial)
  const filtered = hasSavedContacts
    ? recent.filter((m) => {
        const phone = m.chatJid.replace(/@.+$/, "")
        return syncEnabledJids.has(m.chatJid) || syncEnabledJids.has(phone) || m.chatJid.endsWith("@g.us")
      })
    : recent

  for (const msg of filtered) {
    if (!msg.externalId) continue
    const isGroup = msg.chatJid.endsWith("@g.us")
    const phone = msg.chatJid.replace(/@.+$/, "")
    // Prioridad: Contact > agenda Evolution > pushName si no es fromMe
    const contactName = isGroup
      ? (msg.contactName ?? null)
      : (contactNameOverride.get(msg.chatJid) ?? contactNameOverride.get(phone)
          ?? contactsMap.get(msg.chatJid) ?? contactsMap.get(phone)
          ?? (!msg.fromMe ? msg.contactName : null) ?? null)
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
