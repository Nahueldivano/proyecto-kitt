import { db } from "@/lib/db"
import { listUnreadEmails } from "@/lib/gmail"

export interface ReportContext {
  waContext: string
  gmailContext: string
}

// Pre-carga contexto de WhatsApp (últimas 48h) y Gmail (20 emails no leídos).
// Usado tanto por generate/route.ts como por cron/reports/route.ts.
export async function buildReportContext(tenantId: string): Promise<ReportContext> {
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000)

  // WhatsApp: últimas 48h, máx 300 mensajes
  let waContext = ""
  try {
    const waMessages = await db.$queryRawUnsafe<Array<{
      chatJid: string
      chatName: string | null
      contactName: string | null
      fromMe: boolean
      body: string
      timestamp: Date
    }>>(`
      SELECT "chatJid", "chatName", "contactName", "fromMe", "body", "timestamp"
      FROM "WhatsappMessage"
      WHERE "tenantId" = $1 AND "timestamp" >= $2
      ORDER BY "timestamp" ASC
      LIMIT 300
    `, tenantId, since48h)

    if (waMessages.length > 0) {
      const byChatJid = new Map<string, typeof waMessages>()
      for (const m of waMessages) {
        const arr = byChatJid.get(m.chatJid) ?? []
        arr.push(m)
        byChatJid.set(m.chatJid, arr)
      }
      const lines: string[] = []
      for (const msgs of byChatJid.values()) {
        const chatLabel = msgs[0].chatName
          ?? msgs.find(m => !m.fromMe)?.contactName
          ?? msgs[0].chatJid
        lines.push(`\n--- Chat: ${chatLabel} ---`)
        for (const m of msgs.slice(-30)) {
          const sender = m.fromMe ? "Yo" : (m.contactName ?? "Contacto")
          const ts = m.timestamp.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
          lines.push(`[${ts}] ${sender}: ${m.body.substring(0, 200)}`)
        }
      }
      waContext = `MENSAJES DE WHATSAPP (últimas 48h, ${waMessages.length} mensajes en ${byChatJid.size} chats):\n${lines.join("\n")}`
    }
  } catch (e) {
    console.warn("[reportContext] WhatsApp query error:", e)
  }

  // Gmail: hasta 20 emails no leídos
  let gmailContext = ""
  try {
    const emails = await listUnreadEmails(tenantId, 20)
    if (emails.length > 0) {
      const lines = emails.map(e =>
        `• De: ${e.from} | Asunto: ${e.subject} | ${e.date}\n  ${e.snippet}`
      )
      gmailContext = `EMAILS NO LEÍDOS (${emails.length}):\n${lines.join("\n\n")}`
    }
  } catch {
    // Gmail no conectado o token expirado — silencioso
  }

  return { waContext, gmailContext }
}
