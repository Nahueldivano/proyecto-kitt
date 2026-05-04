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
        "fromMe"       BOOLEAN NOT NULL DEFAULT false,
        "body"         TEXT  NOT NULL,
        "messageType"  TEXT  NOT NULL DEFAULT 'text',
        "timestamp"    TIMESTAMP(3) NOT NULL,
        "metadata"     JSONB NOT NULL DEFAULT '{}',
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
      )
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
  const configHistoryDays = Number(cfg.waHistoryDays ?? 7)
  const historyDays = bodyData.historyDays ? Number(bodyData.historyDays) : configHistoryDays
  const whitelist: string[] = Array.isArray(cfg.waContactWhitelist) ? (cfg.waContactWhitelist as string[]) : []

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

  // Corregir contactName en chats 1:1 donde quedó guardado el nombre propio
  // (pushName del mensaje fromMe=true). Priorizar siempre el nombre de la agenda.
  let contactsFixed = 0
  for (const [jid, agendaName] of contactsMap.entries()) {
    if (jid.endsWith("@g.us")) continue
    try {
      const result = await db.$executeRawUnsafe(`
        UPDATE "WhatsappMessage"
        SET "contactName" = $1
        WHERE "tenantId" = $2 AND "chatJid" = $3
          AND ("contactName" IS NULL OR "contactName" != $1)
      `, agendaName, tenantId, jid)
      contactsFixed += Number(result)
    } catch { /* ignorar errores individuales */ }
  }
  if (retroUpdated > 0) diagnostics.push(`retroactive chatName update: ${retroUpdated} rows`)
  if (contactsFixed > 0) diagnostics.push(`contactName fixed from agenda: ${contactsFixed} rows`)

  try {
    // Traer mensajes en bloque desde Evolution — sin límite artificial
    const allMessages = await findMessages(tenantId, { limit: 10000 })
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
          // En grupos: contactName = quien envió el mensaje (pushName)
          // En 1:1: siempre el nombre de la agenda (contactsMap), nunca el pushName propio
          const contactName = isGroup
            ? (msg.contactName ?? null)
            : (contactsMap.get(msg.chatJid) ?? (!msg.fromMe ? msg.contactName : null) ?? null)
          const chatName = isGroup ? (groupNamesMap.get(msg.chatJid) ?? null) : null

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

    return NextResponse.json({
      ok: true,
      chatsProcessed: byChatJid.size,
      messagesSaved: totalSaved,
      messagesSkipped: totalSkipped,
      audiosTranscribed: totalTranscribed,
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
