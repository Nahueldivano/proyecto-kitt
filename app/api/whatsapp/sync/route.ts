import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findChats, findContacts, findGroupNames, findMessages, getMessageMediaBase64 } from "@/lib/evolution"
import { getTenantOpenAIKey, transcribeAudioBase64 } from "@/lib/whisper"

// Sin límite por chat — se guardan todos los mensajes dentro de la ventana de tiempo

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = session.user.tenantId
  const diagnostics: string[] = []

  // Si detectamos esquema viejo roto, dropear y recrear (no hay datos útiles)
  try {
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'WhatsappMessage'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'WhatsappMessage'
            AND column_name = 'externalId'
            AND ordinal_position <= 5
        ) THEN
          DROP TABLE "WhatsappMessage" CASCADE;
        END IF;
      END $$;
    `)
    diagnostics.push("schema check OK")
  } catch (e) {
    diagnostics.push(`schema check warning: ${e}`)
  }
  // Crear tabla con esquema correcto si no existe
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
        "id"           TEXT  NOT NULL,
        "tenantId"     TEXT  NOT NULL,
        "externalId"   TEXT,
        "chatJid"      TEXT  NOT NULL,
        "contactName"  TEXT,
        "chatName"     TEXT,
        "fromMe"       BOOLEAN NOT NULL DEFAULT false,
        "body"         TEXT  NOT NULL,
        "messageType"  TEXT  NOT NULL DEFAULT 'text',
        "timestamp"    TIMESTAMP(3) NOT NULL,
        "metadata"     JSONB NOT NULL DEFAULT '{}',
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
      )
    `)
    // Agregar columna chatName a tablas existentes que no la tengan
    await db.$executeRawUnsafe(`
      ALTER TABLE "WhatsappMessage" ADD COLUMN IF NOT EXISTS "chatName" TEXT
    `)
    diagnostics.push("table OK")
  } catch (e) {
    diagnostics.push(`table create warning: ${e}`)
  }
  // Índice parcial para ON CONFLICT con externalId nullable
  try {
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsappMessage_tenantId_externalId_key" ON "WhatsappMessage"("tenantId", "externalId") WHERE "externalId" IS NOT NULL`
    )
    diagnostics.push("index OK")
  } catch (e) {
    diagnostics.push(`index create warning: ${e}`)
  }
  // Verificar que la tabla existe y es accesible antes de continuar
  try {
    await db.$executeRawUnsafe(`SELECT 1 FROM "WhatsappMessage" LIMIT 1`)
    diagnostics.push("table accessible")
  } catch (e) {
    diagnostics.push(`table not accessible: ${e}`)
    return NextResponse.json({ error: "La tabla WhatsappMessage no existe o no es accesible", detail: String(e), diagnostics }, { status: 500 })
  }

  // Leer body para overrides opcionales: since, until, historyDays
  let bodyData: Record<string, unknown> = {}
  try { bodyData = await req.json() } catch { /* body vacío es válido */ }

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } })
  const cfg = (tenant?.config ?? {}) as Record<string, unknown>
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

  // Default: 1 día (últimas 24hs). Máximo permitido: 3 días (72hs).
  // El botón manual puede pasar historyDays; sync conversacional igual (cap = 3).
  const requestedDays = bodyData.historyDays ? Number(bodyData.historyDays) : 1
  const historyDays = Math.min(Math.max(requestedDays, 1), 3)

  const since = bodyData.since
    ? new Date(String(bodyData.since))
    : new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)
  const until = bodyData.until ? new Date(String(bodyData.until)) : new Date()
  diagnostics.push(`historyDays=${historyDays}, since=${since.toISOString()}, until=${until.toISOString()}, whitelist=${JSON.stringify(whitelist)}`)

  // Cargar contactos y nombres de grupos en paralelo
  const [contactsMap, groupNamesMap] = await Promise.all([
    findContacts(tenantId),
    findGroupNames(tenantId),
  ])
  diagnostics.push(`contacts loaded: ${contactsMap.size}, groups: ${groupNamesMap.size}`)

  // Auto-guardar contactos en tabla Contact y enriquecer phones de @lid existentes.
  // contactsMap viene de findContacts (agenda del teléfono) — tiene JIDs reales @s.whatsapp.net
  // con números de teléfono reales. Los @lid de mensajes se cruzan por nombre para obtener el phone.
  let contactsAutoSaved = 0
  for (const [jid, name] of contactsMap.entries()) {
    if (!jid.includes("@") || jid.endsWith("@g.us")) continue
    const isLid = jid.endsWith("@lid") || jid.endsWith("@c.us")
    const rawPhone = isLid ? null : jid.replace(/@.+$/, "")
    const phone = rawPhone && rawPhone.length <= 13 ? rawPhone : null
    try {
      const existing = await db.contact.findFirst({
        where: { tenantId, OR: [{ chatJid: jid }, ...(phone ? [{ phone }] : [])] },
        select: { id: true, phone: true },
      })
      if (!existing) {
        await db.contact.create({ data: { tenantId, chatJid: jid, name, phone, isGroup: false, tags: [], syncEnabled: true } })
        contactsAutoSaved++
      } else if (phone && !existing.phone) {
        await db.contact.update({ where: { id: existing.id }, data: { phone } })
      }
      // Enriquecer @lid con phone real: buscar Contact con mismo nombre sin phone
      // y migrar sus mensajes al JID real para que quede un solo chat
      if (phone) {
        const realJid = `${phone}@s.whatsapp.net`
        const lidContact = await db.contact.findFirst({
          where: { tenantId, phone: null, name, isGroup: false },
          select: { id: true, chatJid: true },
        })
        if (lidContact && (lidContact.chatJid.endsWith("@lid") || lidContact.chatJid.endsWith("@c.us"))) {
          await db.contact.update({ where: { id: lidContact.id }, data: { phone, chatJid: realJid } }).catch(() => {})
          // Migrar mensajes del @lid al JID real
          await db.$executeRawUnsafe(
            `UPDATE "WhatsappMessage" SET "chatJid" = $1 WHERE "tenantId" = $2 AND "chatJid" = $3`,
            realJid, tenantId, lidContact.chatJid
          ).catch(() => {})
        }
      }
    } catch { /* ignorar duplicados */ }
  }
  // Grupos
  for (const [jid, name] of groupNamesMap.entries()) {
    try {
      const existing = await db.contact.findFirst({ where: { tenantId, chatJid: jid }, select: { id: true } })
      if (!existing) {
        await db.contact.create({ data: { tenantId, chatJid: jid, name, isGroup: true, tags: [], syncEnabled: true } })
        contactsAutoSaved++
      }
    } catch { /* ignorar duplicados */ }
  }
  if (contactsAutoSaved > 0) diagnostics.push(`contacts auto-saved: ${contactsAutoSaved}`)

  // Actualizar chatName retroactivo para grupos
  let retroUpdated = 0
  for (const [jid, name] of groupNamesMap.entries()) {
    try {
      const result = await db.$executeRawUnsafe(`
        UPDATE "WhatsappMessage"
        SET "chatName" = $1
        WHERE "tenantId" = $2 AND "chatJid" = $3 AND "chatName" IS NULL
      `, name, tenantId, jid)
      retroUpdated += Number(result)
    } catch { /* ignorar errores individuales */ }
  }

  // Corregir contactName en chats 1:1:
  // - Con nombre de agenda: aplicar a todos los mensajes del chat (por número, une variantes @lid)
  // - Sin nombre de agenda: limpiar contactName de mensajes fromMe=true (ese nombre es el del tenant)
  let contactsFixed = 0
  const allJids = await db.$queryRawUnsafe<Array<{ chatJid: string }>>(
    `SELECT DISTINCT "chatJid" FROM "WhatsappMessage"
     WHERE "tenantId" = $1 AND "chatJid" NOT LIKE '%@g.us'`,
    tenantId
  ).catch(() => [] as Array<{ chatJid: string }>)

  for (const { chatJid } of allJids as Array<{ chatJid: string }>) {
    const phone = chatJid.replace(/@.+$/, "")
    const agendaName = contactsMap.get(chatJid) ?? contactsMap.get(phone) ?? null
    try {
      if (agendaName) {
        const result = await db.$executeRawUnsafe(`
          UPDATE "WhatsappMessage" SET "contactName" = $1
          WHERE "tenantId" = $2 AND regexp_replace("chatJid", '@.+$', '') = $3
            AND ("contactName" IS NULL OR "contactName" != $1)
        `, agendaName, tenantId, phone)
        contactsFixed += Number(result)
      } else {
        // Sin agenda: NULL los mensajes propios para que no figure el nombre del tenant
        await db.$executeRawUnsafe(`
          UPDATE "WhatsappMessage" SET "contactName" = NULL
          WHERE "tenantId" = $1 AND regexp_replace("chatJid", '@.+$', '') = $2
            AND "fromMe" = true AND "contactName" IS NOT NULL
        `, tenantId, phone)
      }
    } catch { /* ignorar errores individuales */ }
  }
  if (retroUpdated > 0) diagnostics.push(`retroactive chatName update: ${retroUpdated} rows`)
  if (contactsFixed > 0) diagnostics.push(`contactName fixed from agenda: ${contactsFixed} rows`)

  try {
    // Traer mensajes desde Evolution acotado a la ventana de tiempo solicitada.
    // findMessages paginiza y corta al pasar `since` — evita bajar 45k+ msgs cuando solo querés 7 días.
    const allMessages = await findMessages(tenantId, { limit: 50000, sinceDate: since })
    diagnostics.push(`evolution returned ${allMessages.length} messages`)

    // Filtrar por ventana de tiempo
    const recent = allMessages.filter((m) => m.timestamp >= since && m.timestamp <= until)
    diagnostics.push(`after time filter: ${recent.length} messages`)

    // Filtrar por whitelist (JID exacto)
    const filtered = whitelist.length > 0
      ? recent.filter((m) => whitelist.includes(m.chatJid))
      : recent
    diagnostics.push(`after whitelist filter: ${filtered.length} messages`)

    // Agrupar por chatJid para stats (sin límite por chat)
    const byChatJid = new Map<string, typeof filtered>()
    for (const msg of filtered) {
      const arr = byChatJid.get(msg.chatJid) ?? []
      arr.push(msg)
      byChatJid.set(msg.chatJid, arr)
    }
    diagnostics.push(`chats to sync: ${byChatJid.size}`)

    let totalSaved = 0
    let totalSkipped = 0
    const insertErrors: string[] = []

    // FASE 1: insertar todos los mensajes (sin transcribir aún)
    for (const msgs of byChatJid.values()) {
      for (const msg of msgs) {
        if (!msg.externalId) { totalSkipped++; continue }
        try {
          const isGroup = msg.chatJid.endsWith("@g.us")
          const phone = msg.chatJid.replace(/@.+$/, "")
          // En grupos: contactName = quien envió el mensaje (pushName del remitente)
          // En 1:1: nombre de agenda (por JID o por número), luego pushName si no es mensaje propio
          const contactName = isGroup
            ? (msg.contactName ?? null)
            : (contactsMap.get(msg.chatJid) ?? contactsMap.get(phone)
                ?? (!msg.fromMe ? msg.contactName : null) ?? null)
          const chatName = isGroup ? (groupNamesMap.get(msg.chatJid) ?? msg.chatName ?? null) : null

          const metadata = msg.messageType === "audio"
            ? JSON.stringify({ messageKey: msg.messageKey, transcribed: false })
            : "{}"

          // ON CONFLICT DO NOTHING — no sobreescribe mensajes ya guardados
          // $executeRawUnsafe devuelve el número de filas afectadas
          await db.$executeRawUnsafe(`
            INSERT INTO "WhatsappMessage"
              ("id","tenantId","externalId","chatJid","contactName","chatName","fromMe","body","messageType","timestamp","metadata","createdAt")
            VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
            ON CONFLICT ("tenantId","externalId") WHERE "externalId" IS NOT NULL DO NOTHING
          `,
            tenantId, msg.externalId, msg.chatJid, contactName, chatName,
            msg.fromMe, msg.body, msg.messageType, msg.timestamp, metadata,
          )
          totalSaved++
        } catch (err) {
          const e = `[${msg.chatJid}] ${err instanceof Error ? err.message : String(err)}`
          insertErrors.push(e)
          console.warn("[whatsapp/sync] insert error:", e)
        }
      }
    }

    // FASE 2: transcribir todos los audios pendientes del tenant (nuevos + viejos sin transcribir)
    let totalTranscribed = 0
    let transcribeErrors = 0
    const openaiKey = await getTenantOpenAIKey(tenantId)
    diagnostics.push(`openai key: ${openaiKey ? "configurada" : "no configurada"}`)

    if (openaiKey) {
      // Buscar todos los audios sin transcribir del tenant
      const pendingAudios = await db.$queryRawUnsafe<Array<{
        id: string; externalId: string | null; chatJid: string; fromMe: boolean; metadata: unknown
      }>>(
        `SELECT "id","externalId","chatJid","fromMe","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "messageType" = 'audio' AND "body" = '[audio]'
         ORDER BY "timestamp" DESC
         LIMIT 200`,
        tenantId,
      )
      diagnostics.push(`pending audios to transcribe: ${pendingAudios.length}`)

      for (const row of pendingAudios) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>
        const mk = meta.messageKey as { id: string; remoteJid: string; fromMe: boolean } | undefined
        const key = mk ?? (row.externalId
          ? { id: row.externalId, remoteJid: row.chatJid, fromMe: row.fromMe }
          : null)
        if (!key) { transcribeErrors++; continue }

        try {
          const media = await getMessageMediaBase64(tenantId, key)
          if (!media) { transcribeErrors++; continue }
          const text = await transcribeAudioBase64(media.base64, media.mimetype, openaiKey)
          if (!text) { transcribeErrors++; continue }
          await db.$executeRawUnsafe(
            `UPDATE "WhatsappMessage" SET "body" = $1, "metadata" = $2::jsonb WHERE "id" = $3 AND "tenantId" = $4`,
            text,
            JSON.stringify({ ...meta, messageKey: key, transcribed: true }),
            row.id,
            tenantId,
          )
          totalTranscribed++
        } catch {
          transcribeErrors++
        }
      }
      diagnostics.push(`transcribed: ${totalTranscribed}, errors: ${transcribeErrors}`)
    }

    // FASE 3: crear contactos SOLO para chats con actividad en los últimos 30 días
    // Y solo si tienen nombre real (no solo número). No crear contactos sin nombre.
    let contactsCreated = 0
    try {
      const recentChats = await db.$queryRawUnsafe<Array<{
        chatJid: string
        contactName: string | null
        chatName: string | null
      }>>(`
        SELECT
          "chatJid",
          (ARRAY_AGG("contactName" ORDER BY "timestamp" DESC) FILTER (WHERE "contactName" IS NOT NULL AND "fromMe" = false))[1] AS "contactName",
          (ARRAY_AGG("chatName" ORDER BY "timestamp" DESC) FILTER (WHERE "chatName" IS NOT NULL))[1] AS "chatName"
        FROM "WhatsappMessage"
        WHERE "tenantId" = $1
          AND "timestamp" >= NOW() - INTERVAL '30 days'
        GROUP BY "chatJid"
      `, tenantId)

      for (const row of recentChats) {
        if (!row.chatJid?.includes("@")) continue
        const isGroup = row.chatJid.endsWith("@g.us")
        const isLid = row.chatJid.endsWith("@lid") || row.chatJid.endsWith("@c.us")
        // Para @lid y grupos: no guardar phone (no es un número de teléfono real)
        // Para @s.whatsapp.net: el número puede seguir siendo un lid disfrazado si tiene >13 dígitos
        const rawPhone = (!isGroup && !isLid) ? row.chatJid.replace(/@.+$/, "") : null
        const phone = rawPhone && rawPhone.length <= 13 ? rawPhone : null
        const bestName = row.chatName ?? row.contactName ?? null

        // Solo crear si tiene nombre real (no solo número)
        if (!bestName) continue

        try {
          await db.contact.upsert({
            where: { tenantId_chatJid: { tenantId, chatJid: row.chatJid } },
            update: {}, // nunca sobreescribir nombre editado por usuario
            create: { tenantId, chatJid: row.chatJid, name: bestName, phone, isGroup, tags: [], syncEnabled: true },
          })
          contactsCreated++
        } catch { /* ignorar errores individuales */ }
      }
      diagnostics.push(`contacts upserted: ${contactsCreated}`)
    } catch (e) {
      diagnostics.push(`contacts phase error: ${e}`)
    }

    return NextResponse.json({
      ok: true,
      chatsProcessed: byChatJid.size,
      messagesSaved: totalSaved,
      messagesSkipped: totalSkipped,
      audiosTranscribed: totalTranscribed,
      contactsCreated,
      insertErrors: insertErrors.slice(0, 5),
      since: since.toISOString(),
      until: until.toISOString(),
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
