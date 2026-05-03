import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findChats, findContacts, findGroupNames, findMessages, getMessageMediaBase64 } from "@/lib/evolution"
import { getTenantOpenAIKey, transcribeAudioBase64 } from "@/lib/whisper"

const MAX_MSGS_PER_CHAT = 50

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

  // Actualizar chatName retroactivo en filas existentes sin nombre
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
  if (retroUpdated > 0) diagnostics.push(`retroactive chatName update: ${retroUpdated} rows`)

  try {
    // Traer mensajes en bloque desde Evolution
    const allMessages = await findMessages(tenantId, { limit: 2000 })
    diagnostics.push(`evolution returned ${allMessages.length} messages`)

    // Filtrar por ventana de tiempo
    const recent = allMessages.filter((m) => m.timestamp >= since && m.timestamp <= until)
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

    // Resolver OpenAI key una sola vez para todos los audios
    const openaiKey = await getTenantOpenAIKey(tenantId)
    diagnostics.push(`openai key: ${openaiKey ? "configurada" : "no configurada"}`)

    let totalSaved = 0
    let totalSkipped = 0
    let totalTranscribed = 0
    const insertErrors: string[] = []

    for (const [jid, msgs] of byChatJid.entries()) {
      for (const msg of msgs) {
        if (!msg.externalId) { totalSkipped++; continue }
        try {
          const contactName = msg.contactName ?? contactsMap.get(msg.chatJid) ?? null
          const isGroup = msg.chatJid.endsWith("@g.us")
          const chatName = isGroup ? (groupNamesMap.get(msg.chatJid) ?? null) : null

          // Intentar transcripción inmediata si es audio y hay key disponible
          let body = msg.body
          let transcribed = false
          if (msg.messageType === "audio" && openaiKey) {
            try {
              const media = await getMessageMediaBase64(tenantId, msg.messageKey)
              if (media) {
                const text = await transcribeAudioBase64(media.base64, media.mimetype, openaiKey)
                if (text) {
                  body = text
                  transcribed = true
                  totalTranscribed++
                }
              }
            } catch {
              // Si falla la transcripción, guardar placeholder y seguir
            }
          }

          const metadata = msg.messageType === "audio"
            ? JSON.stringify({ messageKey: msg.messageKey, transcribed })
            : "{}"

          await db.$executeRawUnsafe(`
            INSERT INTO "WhatsappMessage"
              ("id","tenantId","externalId","chatJid","contactName","chatName","fromMe","body","messageType","timestamp","metadata","createdAt")
            VALUES
              (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
            ON CONFLICT ("tenantId","externalId") WHERE "externalId" IS NOT NULL DO NOTHING
          `,
            tenantId,
            msg.externalId,
            msg.chatJid,
            contactName,
            chatName,
            msg.fromMe,
            body,
            msg.messageType,
            msg.timestamp,
            metadata,
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
      audiosTranscribed: totalTranscribed,
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
