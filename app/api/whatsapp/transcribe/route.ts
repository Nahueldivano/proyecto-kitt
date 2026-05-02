import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMessageMediaBase64 } from "@/lib/evolution"
import { transcribeAudioBase64 } from "@/lib/whisper"

interface AudioRow {
  id: string
  externalId: string | null
  chatJid: string
  fromMe: boolean
  metadata: Record<string, unknown>
}

// POST /api/whatsapp/transcribe
// Body: { messageId?: string, batch?: boolean, max?: number }
// - messageId: transcribe un audio específico
// - batch: transcribe todos los audios pendientes (body = '[audio]') del tenant, con tope opcional
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const tenantId = session.user.tenantId

  let body: { messageId?: string; batch?: boolean; max?: number } = {}
  try {
    body = await req.json()
  } catch {}

  const max = Math.min(Math.max(Number(body.max ?? 20), 1), 50)

  let rows: AudioRow[] = []
  try {
    if (body.messageId) {
      rows = await db.$queryRawUnsafe<AudioRow[]>(
        `SELECT "id","externalId","chatJid","fromMe","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "id" = $2 AND "messageType" = 'audio'
         LIMIT 1`,
        tenantId,
        body.messageId,
      )
    } else if (body.batch) {
      rows = await db.$queryRawUnsafe<AudioRow[]>(
        `SELECT "id","externalId","chatJid","fromMe","metadata"
         FROM "WhatsappMessage"
         WHERE "tenantId" = $1 AND "messageType" = 'audio' AND "body" = '[audio]'
         ORDER BY "timestamp" DESC
         LIMIT $2`,
        tenantId,
        max,
      )
    } else {
      return NextResponse.json({ error: "Falta messageId o batch:true" }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  let transcribed = 0
  let failed = 0
  const errors: string[] = []

  for (const row of rows) {
    const meta = row.metadata ?? {}
    const mk = (meta as { messageKey?: { id: string; remoteJid: string; fromMe: boolean } }).messageKey
    const key = mk ?? (row.externalId
      ? { id: row.externalId, remoteJid: row.chatJid, fromMe: row.fromMe }
      : null)
    if (!key) {
      failed++
      errors.push(`${row.id}: sin messageKey`)
      continue
    }

    try {
      const media = await getMessageMediaBase64(tenantId, key)
      if (!media) {
        failed++
        errors.push(`${row.id}: no media`)
        continue
      }
      const text = await transcribeAudioBase64(media.base64, media.mimetype)
      if (!text) {
        failed++
        errors.push(`${row.id}: transcripción vacía`)
        continue
      }
      const newMeta = { ...meta, messageKey: key, transcribed: true }
      await db.$executeRawUnsafe(
        `UPDATE "WhatsappMessage"
         SET "body" = $1, "metadata" = $2::jsonb
         WHERE "id" = $3 AND "tenantId" = $4`,
        text,
        JSON.stringify(newMeta),
        row.id,
        tenantId,
      )
      transcribed++
    } catch (err) {
      failed++
      errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    transcribed,
    failed,
    errors: errors.slice(0, 10),
  })
}
