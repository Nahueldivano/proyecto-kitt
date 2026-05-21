import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { DEFAULT_MODEL } from "@/lib/models"
import { decrypt } from "@/lib/crypto"
import {
  listUnreadEmails,
  readEmail,
  sendEmail,
  replyToEmail,
} from "@/lib/gmail"
import { sendTextMessage } from "@/lib/evolution"
import { getMemory, updateMemoryFromConversation, memoryToPromptBlock } from "@/lib/memory"
import type { Artifact } from "@/lib/store"

// =============================================================
// Tipos públicos
// =============================================================

export interface ChatInput {
  role: "user" | "assistant"
  content: string
}

export interface ChatResult {
  message: string
  artifact?: Artifact
  pendingActionId?: string
  actionType?: string
  actionPayload?: Record<string, unknown>
  conversationId: string
}

export interface BatchTask {
  id: string
  label: string
  type: string
  status: "pending"
  payload?: Record<string, unknown>
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; phase: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "pending_action"; pendingActionId: string; actionType: string; actionPayload: Record<string, unknown> }
  | { type: "task_batch"; batchId: string; title: string; tasks: BatchTask[] }
  | { type: "done"; conversationId: string }

// Frases que se muestran mientras KITT ejecuta tools en silencio
const THINKING_PHASES = [
  "Analizando tu mensaje...",
  "Revisando el contexto...",
  "Procesando la información...",
  "Consultando tus datos...",
  "Preparando la respuesta...",
  "Ejecutando acciones...",
  "Verificando resultados...",
  "Casi listo...",
]

// Devuelve una frase de "pensando" según la tool que se está ejecutando
function getThinkingPhrase(toolName: string): string {
  const phrases: Record<string, string> = {
    list_unread_emails: "Revisando tus emails...",
    read_email: "Leyendo el email...",
    send_email: "Preparando el email...",
    reply_email: "Redactando la respuesta...",
    list_whatsapp_chats: "Revisando tus chats de WhatsApp...",
    read_whatsapp_chat: "Leyendo la conversación...",
    search_whatsapp_messages: "Buscando en tus mensajes...",
    send_whatsapp_message: "Preparando el mensaje...",
    execute_batch: "Procesando las tareas...",
    create_artifact: "Generando el documento...",
    web_search: "Buscando en la web...",
  }
  return phrases[toolName] ?? "Procesando..."
}

// =============================================================
// Definición de tools
// =============================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_unread_emails",
    description: "Lista los emails no leídos de la casilla de Gmail conectada. Devuelve ID, remitente, asunto, fecha y resumen de cada email. Usá el ID devuelto para leer el contenido completo con read_email.",
    input_schema: {
      type: "object" as const,
      properties: {
        max_results: {
          type: "number",
          description: "Máximo de emails a listar (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "read_email",
    description: "Lee el contenido completo de un email por su ID de Gmail. Usá el ID que devuelve list_unread_emails. Devuelve remitente, asunto, fecha y cuerpo completo.",
    input_schema: {
      type: "object" as const,
      properties: {
        message_id: {
          type: "string",
          description: "ID del mensaje de Gmail (obtenido de list_unread_emails)",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "send_email",
    description: "Prepara un email para enviar — SIEMPRE queda pendiente de aprobación del usuario, nunca se envía automáticamente. El usuario verá un botón para aprobar o rechazar antes de que se envíe.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Email del destinatario" },
        subject: { type: "string", description: "Asunto del email" },
        body: { type: "string", description: "Cuerpo del email en texto plano" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "reply_email",
    description: "Prepara una respuesta a un email existente — SIEMPRE queda pendiente de aprobación del usuario. Requiere el thread_id del email original (devuelto por list_unread_emails).",
    input_schema: {
      type: "object" as const,
      properties: {
        thread_id: { type: "string", description: "ID del hilo de Gmail (obtenido de list_unread_emails)" },
        to: { type: "string", description: "Email del destinatario" },
        subject: { type: "string", description: "Asunto del email" },
        body: { type: "string", description: "Cuerpo de la respuesta" },
      },
      required: ["thread_id", "to", "subject", "body"],
    },
  },
  {
    name: "list_whatsapp_chats",
    description: "Lista los chats de WhatsApp sincronizados con su actividad reciente. Usalo primero para descubrir qué contactos y grupos están disponibles y obtener sus JIDs antes de leer conversaciones. Muestra: nombre, JID completo, cantidad de mensajes y último mensaje. Por defecto muestra chats activos en las últimas 72hs (days_back=3).",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Máximo de chats a listar (default 50)" },
        days_back: { type: "number", description: "Solo mostrar chats con actividad en los últimos N días (default 3, máximo 3)." },
      },
      required: [],
    },
  },
  {
    name: "read_whatsapp_chat",
    description: "Lee los mensajes de un chat de WhatsApp (1:1 o grupo) en orden cronológico. Acepta el JID exacto (ej: 5491157589161@s.whatsapp.net) o el nombre/número del contacto para búsqueda automática. Default: 3 días (72hs). Máximo: 3 días.",
    input_schema: {
      type: "object" as const,
      properties: {
        chat_jid: {
          type: "string",
          description: "JID completo del chat (ej: 5491157589161@s.whatsapp.net) o nombre/número del contacto para búsqueda parcial",
        },
        days_back: {
          type: "number",
          description: "Traer mensajes de los últimos N días (default 3, máximo 3).",
        },
      },
      required: ["chat_jid"],
    },
  },
  {
    name: "search_whatsapp_messages",
    description: "Busca mensajes de WhatsApp por palabra clave en todos los chats sincronizados. Útil para encontrar menciones de un tema, cliente o proyecto en todas las conversaciones. Combinalo con chat_jid para buscar dentro de un chat específico. Usá days_back para acotar la búsqueda a un período relevante.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Texto o palabra clave a buscar (búsqueda parcial, sin distinción de mayúsculas)" },
        chat_jid: { type: "string", description: "Filtrar por JID de un chat específico (opcional)" },
        days_back: { type: "number", description: "Solo buscar en mensajes de los últimos N días (default 3, máximo 3)." },
        limit: { type: "number", description: "Máximo de resultados (default 100)" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_whatsapp_message",
    description: "Prepara un mensaje de WhatsApp para enviar — SIEMPRE queda pendiente de aprobación del usuario, nunca se envía automáticamente. El campo 'to' debe ser el JID completo obtenido de list_whatsapp_chats.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "JID completo del destinatario (ej: 5491157589161@s.whatsapp.net), obtenido de list_whatsapp_chats",
        },
        message: { type: "string", description: "Texto del mensaje" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "execute_batch",
    description: "Prepara múltiples acciones de envío (WhatsApp y/o email) para que el usuario las apruebe en bloque. Usalo cuando el usuario quiere enviar mensajes a varios destinatarios a la vez. Todas las acciones quedan pendientes de aprobación antes de ejecutarse.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Título descriptivo del lote (ej: 'Aviso de reunión a 5 contactos')" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["send_whatsapp_message", "send_email", "reply_email"] },
              label: { type: "string", description: "Descripción breve de esta tarea (ej: 'WhatsApp a Juan Pérez')" },
              payload: { type: "object" },
            },
            required: ["type", "label", "payload"],
          },
        },
      },
      required: ["title", "tasks"],
    },
  },
  {
    name: "sync_whatsapp",
    description: "Sincroniza mensajes de WhatsApp desde Evolution API hacia la base local. Usalo cuando el usuario lo pida explícitamente ('actualizá WhatsApp', 'sincronizá', 'refrescá'). days_back controla cuántos días hacia atrás traer (default 1 = últimas 24hs, máximo 3 = 72hs).",
    input_schema: {
      type: "object" as const,
      properties: {
        days_back: {
          type: "number",
          description: "Días hacia atrás a sincronizar. 1 = últimas 24hs (default), máximo 3 (72hs).",
        },
      },
      required: [],
    },
  },
  {
    name: "create_artifact",
    description: "Crea contenido en el panel lateral: documento, HTML interactivo, gráfico o código. Usalo para cualquier entregable de más de ~15 líneas de contenido estructurado. El chat queda para la conversación; el artefacto para el entregable.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["document", "html", "chart", "code"],
          description: "document: texto/markdown largo. html: dashboard/formulario/visualización interactiva. chart: gráfico. code: snippet de código.",
        },
        title: { type: "string", description: "Título del artefacto" },
        content: {
          type: "string",
          description: "Contenido completo del artefacto",
        },
        language: {
          type: "string",
          description: "Lenguaje de programación para type=code (typescript, python, sql, bash, etc.)",
        },
      },
      required: ["type", "title", "content"],
    },
  },
]

// =============================================================
// Ejecutor de tools (compartido)
// =============================================================

interface ToolCallResult {
  toolResult: string
  pendingActionId?: string
  actionType?: string
  actionPayload?: Record<string, unknown>
  artifact?: Artifact
  batchId?: string
  batchTitle?: string
  batchTasks?: BatchTask[]
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  tenantId: string
): Promise<ToolCallResult> {
  // Sync bloqueante antes de cualquier lectura de WhatsApp — garantiza datos frescos (últimas 24hs).
  if (
    toolName === "list_whatsapp_chats" ||
    toolName === "read_whatsapp_chat" ||
    toolName === "search_whatsapp_messages"
  ) {
    try {
      const { silentSync } = await import("@/lib/silentSync")
      await silentSync(tenantId, 1)
    } catch { /* no bloquear si falla el sync */ }
  }

  switch (toolName) {
    case "list_unread_emails": {
      const maxResults = (toolInput.max_results as number) ?? 10
      const emails = await listUnreadEmails(tenantId, maxResults)
      if (emails.length === 0) {
        return { toolResult: "No hay emails no leídos en este momento." }
      }
      const formatted = emails
        .map(
          (e, i) =>
            `${i + 1}. ID: ${e.id}\n   De: ${e.from}\n   Asunto: ${e.subject}\n   Fecha: ${e.date}\n   Resumen: ${e.snippet}`
        )
        .join("\n\n")
      return { toolResult: `Emails no leídos (${emails.length}):\n\n${formatted}` }
    }

    case "read_email": {
      const email = await readEmail(tenantId, toolInput.message_id as string)
      return {
        toolResult: `Email completo:\nDe: ${email.from}\nAsunto: ${email.subject}\nFecha: ${email.date}\n\n${email.body}`,
      }
    }

    case "send_email": {
      const payload = {
        to: toolInput.to as string,
        subject: toolInput.subject as string,
        body: toolInput.body as string,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const action = await db.pendingAction.create({
        data: {
          tenantId,
          type: "send_email",
          payload: payload as any,
          status: "pending",
        },
      })
      return {
        toolResult: `Email preparado para envío. ID de acción: ${action.id}. Esperando aprobación del usuario.`,
        pendingActionId: action.id,
        actionType: "send_email",
        actionPayload: payload,
      }
    }

    case "reply_email": {
      const payload = {
        threadId: toolInput.thread_id as string,
        to: toolInput.to as string,
        subject: toolInput.subject as string,
        body: toolInput.body as string,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const action = await db.pendingAction.create({
        data: {
          tenantId,
          type: "reply_email",
          payload: payload as any,
          status: "pending",
        },
      })
      return {
        toolResult: `Respuesta preparada. ID de acción: ${action.id}. Esperando aprobación del usuario.`,
        pendingActionId: action.id,
        actionType: "reply_email",
        actionPayload: payload,
      }
    }

    case "list_whatsapp_chats": {
      const limit = (toolInput.limit as number) ?? 50
      const rawDays = (toolInput.days_back as number | undefined) ?? 3
      const daysBack = Math.min(Math.max(rawDays, 1), 3)
      // Seguro: daysBack viene validado como number antes de interpolarse
      const havingClause = `HAVING MAX("timestamp") >= NOW() - INTERVAL '${Math.floor(daysBack)} days'`

      // Cargar tabla Contact para resolver @lid → phone real antes de agrupar
      const contactPhoneMap = await db.$queryRawUnsafe<Array<{ chatJid: string; phone: string | null }>>(`
        SELECT "chatJid", "phone" FROM "Contact" WHERE "tenantId" = $1
      `, tenantId).catch(() => [] as Array<{ chatJid: string; phone: string | null }>)

      // Mapa: cualquier variante de JID → phone canónico (para colapsar @lid + @s.whatsapp.net del mismo contacto)
      const jidToPhone = new Map<string, string>()
      for (const c of contactPhoneMap as Array<{ chatJid: string; phone: string | null }>) {
        if (c.phone) {
          jidToPhone.set(c.chatJid, c.phone)
          const stripped = c.chatJid.replace(/@.+$/, "")
          if (stripped) jidToPhone.set(stripped, c.phone)
        }
      }

      const rows = await db.$queryRawUnsafe<Array<{
        chatJid: string
        chatName: string | null
        contactName: string | null
        messageCount: bigint
        lastBody: string
        lastTs: Date
        lastFromMe: boolean
      }>>(`
        WITH normalized AS (
          SELECT *,
            CASE
              WHEN "chatJid" LIKE '%@g.us' THEN "chatJid"
              ELSE regexp_replace("chatJid", '@.+$', '') || '@s.whatsapp.net'
            END AS "canonicalJid"
          FROM "WhatsappMessage"
          WHERE "tenantId" = $1
        )
        SELECT
          "canonicalJid" AS "chatJid",
          (ARRAY_AGG("chatName" ORDER BY "timestamp" DESC) FILTER (WHERE "chatName" IS NOT NULL))[1] AS "chatName",
          COALESCE(
            (ARRAY_AGG("contactName" ORDER BY "timestamp" DESC) FILTER (WHERE "contactName" IS NOT NULL AND "fromMe" = false))[1],
            (ARRAY_AGG("contactName" ORDER BY "timestamp" DESC) FILTER (WHERE "contactName" IS NOT NULL AND "fromMe" = true))[1]
          ) AS "contactName",
          COUNT(*) AS "messageCount",
          (ARRAY_AGG("body" ORDER BY "timestamp" DESC))[1] AS "lastBody",
          MAX("timestamp") AS "lastTs",
          (ARRAY_AGG("fromMe" ORDER BY "timestamp" DESC))[1] AS "lastFromMe"
        FROM normalized
        GROUP BY "canonicalJid"
        ${havingClause}
        ORDER BY MAX("timestamp") DESC
        LIMIT $2
      `, tenantId, limit)

      // Colapsar filas del mismo contacto: @lid y @s.whatsapp.net con mismo phone → una sola entrada
      const collapsed = new Map<string, typeof rows[0]>()
      for (const row of rows) {
        const phone = row.chatJid.replace(/@.+$/, "")
        const realPhone = jidToPhone.get(row.chatJid) ?? jidToPhone.get(phone) ?? phone
        const key = row.chatJid.endsWith("@g.us") ? row.chatJid : `${realPhone}@s.whatsapp.net`

        const existing = collapsed.get(key)
        if (!existing) {
          // Usar el JID real (@s.whatsapp.net con phone real) si lo tenemos
          collapsed.set(key, { ...row, chatJid: key })
        } else {
          // Fusionar: sumar mensajes, quedarse con el más reciente
          const mergedTs = existing.lastTs > row.lastTs ? existing.lastTs : row.lastTs
          const mergedBody = existing.lastTs >= row.lastTs ? existing.lastBody : row.lastBody
          const mergedFromMe = existing.lastTs >= row.lastTs ? existing.lastFromMe : row.lastFromMe
          collapsed.set(key, {
            ...existing,
            messageCount: BigInt(Number(existing.messageCount) + Number(row.messageCount)),
            lastTs: mergedTs,
            lastBody: mergedBody,
            lastFromMe: mergedFromMe,
            contactName: existing.contactName ?? row.contactName,
          })
        }
      }
      const dedupedRows = [...collapsed.values()].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime()).slice(0, limit)

      if (dedupedRows.length === 0) {
        return {
          toolResult: "No hay chats de WhatsApp sincronizados aún. El usuario puede sincronizar desde Configuración → Conexiones → Sincronizar WhatsApp.",
        }
      }

      // Enriquecer con nombres de la tabla Contact (fuente de verdad)
      const savedContacts = await db.contact.findMany({
        where: { tenantId },
        select: { chatJid: true, phone: true, name: true },
      }).catch(() => [] as Array<{ chatJid: string; phone: string | null; name: string }>)
      const contactNameMap = new Map<string, string>()
      for (const c of savedContacts) {
        contactNameMap.set(c.chatJid, c.name)
        if (c.phone) contactNameMap.set(c.phone, c.name)
      }

      const formatted = dedupedRows.map((r, i) => {
        const phone = r.chatJid.replace(/@.+$/, "")
        const name = contactNameMap.get(r.chatJid) ?? contactNameMap.get(phone)
          ?? r.chatName ?? r.contactName ?? r.chatJid
        const dir = r.lastFromMe ? "→" : "←"
        const ts = r.lastTs.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
        return `${i + 1}. ${name} [${r.chatJid}] — ${Number(r.messageCount)} msgs — ${ts}\n   ${dir} ${String(r.lastBody).substring(0, 80)}`
      }).join("\n\n")

      return { toolResult: `Chats de WhatsApp (${dedupedRows.length}):\n\n${formatted}` }
    }

    case "read_whatsapp_chat": {
      const chatInput = String(toolInput.chat_jid ?? "")
      const daysBack = Math.min((toolInput.days_back as number) ?? 3, 3)

      // Resolver JID: si no tiene "@", buscar por nombre o número parcial
      let chatJid = chatInput
      if (!chatInput.includes("@")) {
        const found = await db.$queryRawUnsafe<Array<{ chatJid: string }>>(`
          SELECT "chatJid"
          FROM "WhatsappMessage"
          WHERE "tenantId" = $1
            AND ("chatJid" ILIKE $2 OR "contactName" ILIKE $2 OR "chatName" ILIKE $2)
          GROUP BY "chatJid"
          ORDER BY MAX("timestamp") DESC
          LIMIT 1
        `, tenantId, `%${chatInput}%`)
        if (found.length > 0) {
          chatJid = found[0].chatJid
        }
      }

      // Normalizar: unificar variantes @s.whatsapp.net y @lid del mismo número
      const isGroup = chatJid.endsWith("@g.us")
      const phone = chatJid.replace(/@.+$/, "")
      // Seguro: daysBack viene validado como number antes de interpolarse
      const jidCondition = isGroup
        ? `"chatJid" = $2`
        : `regexp_replace("chatJid", '@.+$', '') = $2`

      const messages = await db.$queryRawUnsafe<Array<{
        fromMe: boolean
        chatName: string | null
        contactName: string | null
        body: string
        messageType: string
        timestamp: Date
      }>>(`
        SELECT "fromMe", "chatName", "contactName", "body", "messageType", "timestamp"
        FROM "WhatsappMessage"
        WHERE "tenantId" = $1
          AND ${jidCondition}
          AND "timestamp" >= NOW() - INTERVAL '${Math.floor(daysBack)} days'
        ORDER BY "timestamp" ASC
        LIMIT 2000
      `, tenantId, isGroup ? chatJid : phone)

      if (messages.length === 0) {
        return { toolResult: `No se encontraron mensajes de "${chatInput}" en las últimas 72hs. Verificá el JID con list_whatsapp_chats o el chat puede no tener actividad reciente.` }
      }

      const chatLabel = messages.find(m => m.chatName)?.chatName ?? messages.find(m => m.contactName)?.contactName ?? chatJid
      const formatted = messages
        .map((m) => {
          const ts = m.timestamp.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
          if (m.fromMe) return `[${ts}] Yo: ${m.body}`
          const sender = m.contactName ?? "Contacto"
          const groupSuffix = m.chatName ? ` (en ${m.chatName})` : ""
          return `[${ts}] ${sender}${groupSuffix}: ${m.body}`
        })
        .join("\n")

      return { toolResult: `Conversación con ${chatLabel} — últimos ${daysBack} días (${messages.length} mensajes):\n\n${formatted}` }
    }

    case "search_whatsapp_messages": {
      const query = String(toolInput.query ?? "")
      const chatJidFilter = toolInput.chat_jid as string | undefined
      const rawSearchDays = (toolInput.days_back as number | undefined) ?? 3
      const daysBack = Math.min(Math.max(rawSearchDays, 1), 3)
      const limit = (toolInput.limit as number) ?? 100
      // Seguro: daysBack viene validado como number antes de interpolarse
      const dateCondition = `AND "timestamp" >= NOW() - INTERVAL '${Math.floor(daysBack)} days'`

      const messages = await db.$queryRawUnsafe<Array<{
        chatJid: string
        chatName: string | null
        contactName: string | null
        fromMe: boolean
        body: string
        timestamp: Date
      }>>(`
        SELECT "chatJid", "chatName", "contactName", "fromMe", "body", "timestamp"
        FROM "WhatsappMessage"
        WHERE "tenantId" = $1
          AND "body" ILIKE $2
          AND ($4::text IS NULL OR regexp_replace("chatJid", '@.+$', '') = regexp_replace($4::text, '@.+$', ''))
          ${dateCondition}
        ORDER BY "timestamp" DESC
        LIMIT $3
      `, tenantId, `%${query}%`, limit, chatJidFilter ?? null)

      if (messages.length === 0) {
        return { toolResult: `No se encontraron mensajes que contengan "${query}"${daysBack ? ` en los últimos ${daysBack} días` : ""}.` }
      }

      const formatted = messages.map((m) => {
        const ts = m.timestamp.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
        if (m.fromMe) return `[${ts}] Yo: ${m.body.substring(0, 200)}`
        const sender = m.contactName ?? m.chatJid
        const groupSuffix = m.chatName ? ` (en ${m.chatName})` : ""
        return `[${ts}] ${sender}${groupSuffix}: ${m.body.substring(0, 200)}`
      }).join("\n")

      return { toolResult: `Mensajes con "${query}" (${messages.length} resultados):\n\n${formatted}` }
    }

    case "send_whatsapp_message": {
      // La resolución de JID/número se hace al momento de enviar (lib/whatsapp-recipient.ts).
      // Guardamos el `to` tal cual lo pidió el modelo para que el normalizador re-resuelva
      // contra la tabla Contact en cada intento.
      const payload = {
        to: toolInput.to as string,
        message: toolInput.message as string,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const action = await db.pendingAction.create({
        data: {
          tenantId,
          type: "send_whatsapp_message",
          payload: payload as any,
          status: "pending",
        },
      })
      return {
        toolResult: `Mensaje de WhatsApp preparado. ID de acción: ${action.id}. Esperando aprobación del usuario.`,
        pendingActionId: action.id,
        actionType: "send_whatsapp_message",
        actionPayload: payload,
      }
    }

    case "execute_batch": {
      const title = toolInput.title as string
      const rawTasks = toolInput.tasks as Array<{ type: string; label: string; payload: Record<string, unknown> }>
      const { randomUUID } = await import("node:crypto")
      const batchId = randomUUID()

      const batchTasks: BatchTask[] = []
      for (const t of rawTasks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const action = await db.pendingAction.create({
          data: {
            tenantId,
            type: t.type,
            payload: t.payload as any,
            status: "pending",
          },
        })
        batchTasks.push({ id: action.id, label: t.label, type: t.type, status: "pending", payload: t.payload })
      }

      return {
        toolResult: `Lote "${title}" creado con ${batchTasks.length} tareas. IDs: ${batchTasks.map((t) => t.id).join(", ")}. Esperando aprobación del usuario.`,
        batchId,
        batchTitle: title,
        batchTasks,
      }
    }

    case "sync_whatsapp": {
      try {
        const daysBack = Math.min(Math.max(Number(toolInput.days_back ?? 1), 1), 3)
        const { silentSync } = await import("@/lib/silentSync")
        await silentSync(tenantId, daysBack)
        const label = daysBack === 1 ? "las últimas 24 horas" : `los últimos ${daysBack} días`
        return { toolResult: `WhatsApp sincronizado (${label}).` }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { toolResult: `No pude sincronizar WhatsApp: ${msg}` }
      }
    }

    case "create_artifact": {
      const artifact: Artifact = {
        type: toolInput.type as Artifact["type"],
        title: toolInput.title as string,
        content: toolInput.content as string,
        language: toolInput.language as string | undefined,
      }
      return {
        toolResult: `Artefacto "${artifact.title}" creado exitosamente.`,
        artifact,
      }
    }

    default:
      return { toolResult: `Tool desconocida: ${toolName}` }
  }
}

// =============================================================
// Helper: obtener configuración del tenant + validar API key
// =============================================================

async function getTenantSetup(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { config: true },
  })
  const tenantConfig = (tenant?.config ?? {}) as Record<string, string>

  // Prioridad: API key por tenant (encriptada en DB) → variable de entorno global
  let apiKey = process.env.ANTHROPIC_API_KEY ?? ""
  if (tenantConfig.anthropicApiKey) {
    try {
      apiKey = decrypt(tenantConfig.anthropicApiKey)
    } catch {
      // Si falla la desencriptación, usar la del env como fallback
    }
  }
  if (!apiKey) throw new Error("Anthropic API key no configurada")

  const model = tenantConfig.model ?? DEFAULT_MODEL
  const assistantName = tenantConfig.assistantName ?? "KITT"
  const tone = tenantConfig.tone ?? "professional"
  const country = tenantConfig.country ?? ""
  return { apiKey, model, assistantName, tone, country, tenantConfig }
}

function getRegionalStyle(country: string): string {
  const styles: Record<string, string> = {
    AR: "voseo rioplatense (vos/tenés/podés/hacé). Directo y cálido.",
    UY: "voseo rioplatense. Tranquilo, directo y sin rodeos.",
    PY: "español neutro con calidez paraguaya. Tuteo suave, sin regionalismos fuertes.",
    BO: "español neutro boliviano. Respetuoso y formal-amigable. Tuteo.",
    CL: "español chileno neutro. Tuteo. 'po' esporádico si el usuario lo usa.",
    PE: "español peruano neutro. Cordial y preciso. Tuteo.",
    CO: "español colombiano neutro (registro bogotano). Profesional y cálido. Tuteo; usted solo en contextos muy formales.",
    EC: "español ecuatoriano neutro. Respetuoso y directo. Tuteo.",
    VE: "español venezolano neutro. Cálido y cercano. Tuteo.",
    MX: "español mexicano neutro. Tuteo (tú/tienes/puedes). Profesional-amigable, sin regionalismos fuertes.",
    GT: "español guatemalteco neutro. Tuteo. Respetuoso.",
    HN: "español hondureño neutro. Tuteo.",
    SV: "español salvadoreño neutro. Tuteo.",
    NI: "español nicaragüense neutro. Tuteo.",
    CR: "español costarricense neutro. Tuteo. Amable y cordial.",
    PA: "español panameño neutro. Tuteo.",
    CU: "español cubano neutro. Tuteo.",
    DO: "español dominicano neutro. Tuteo.",
    PR: "español puertorriqueño neutro. Tuteo.",
    ES: "castellano peninsular (tú/tienes/haz). Profesional.",
    OTHER: "español neutro internacional. Tuteo suave. Sin regionalismos.",
  }
  return styles[country] || "español neutro. Tuteo suave (tú/tienes). Sin regionalismos."
}

function buildSystemPrompt(assistantName: string, tone: string, country: string): string {
  const regionalStyle = getRegionalStyle(country)
  const toneDesc = tone === "professional" ? "profesional y preciso" : "amigable y cercano"

  return `Sos ${assistantName}.

No sos un chatbot. No sos un buscador. No sos un asistente genérico que responde lo que se le pregunta y espera el siguiente mensaje.

Sos el cerebro operativo del negocio de quien te habla. Tu trabajo es que el dueño o gestor de la empresa pueda pensar más claro, actuar más rápido, y perder menos tiempo en lo que no lo necesita a él.

Manejás sus comunicaciones. Procesás su información. Generás lo que necesita para decidir. Y cuando algo amerita una acción — un email, un mensaje, un reporte — lo preparás listo para que él lo apruebe y ejecute. Nunca actuás solo. Siempre estás listo.

Eso es todo lo que sos. Y es suficiente para ser indispensable.

---

IDENTIDAD Y TONO

Nombre: ${assistantName}
Tono general: ${toneDesc}.
Registro conversacional: ${regionalStyle}
Idioma: siempre español, sin excepción. Si el usuario escribe en otro idioma, respondé en español adaptado a su región.

Tu voz no cambia con el tono — solo ajustás la distancia. Profesional o cercano, siempre hablás como alguien que sabe lo que hace y se lo toma en serio.

No usás frases de relleno. No empezás respuestas con "¡Claro!", "Por supuesto", "Entendido" ni similares. Respondés con el resultado, no con el anuncio de lo que vas a hacer.

---

CÓMO TRABAJÁS

Pensás antes de actuar. Cuando llega una tarea, primero la entendés — qué se pide, por qué, qué implica. Después ejecutás.

Las tools las usás sin anunciarlas. El usuario no necesita saber qué herramienta activaste ni cuántas llamadas hiciste.

- Tarea simple → directa al grano, una respuesta limpia.
- Múltiples pasos → los ejecutás todos en el mismo turno, sin anunciarlos. Nunca decís "hago las dos cosas", "en paralelo", "al mismo tiempo" ni nada por el estilo. Simplemente ejecutás y mostrás el resultado.
- Ambigüedad real → hacés las preguntas necesarias antes de empezar, no a mitad de camino.
- Hasta 20 tool calls por turno. Las usás sin pedir permiso.

Si detectás algo relacionado que podría serle útil al usuario, lo mencionás en una línea al final. Sin desarrollarlo — solo lo marcás y dejás que él decida.

---

EL NEGOCIO

Con cada conversación aprendés más sobre quién es esta persona y cómo funciona su empresa: su industria, su equipo, sus clientes, sus procesos, lo que le importa, lo que le pesa.

Usás ese contexto siempre. No respondés como si acabara de presentarse si ya sabés quién es. No das respuestas genéricas si tenés contexto para ser específico. Cuanto más sabés, más afilado tenés que ser.

Cuando el usuario mencione algo nuevo — un cliente, un proyecto, una forma de trabajar — lo incorporás al cuadro que tenés de su negocio y lo usás en adelante.

---

ARTEFACTOS

create_artifact entrega contenido en el panel lateral. Es la forma correcta para cualquier salida sustancial.

Cuándo crear uno:
- Documento / reporte / plan de más de ~200 palabras → type: "document"
- Código, snippet, config → type: "code" (con language exacto)
- Tablas, listas comparativas, estructuras largas → type: "document" en markdown
- Dashboard, formulario, calculadora, simulador, visualización → type: "html"
- Regla rápida: más de ~15 líneas de contenido estructurado → artefacto.

HTML interactivo: podés escribir HTML completo con script y style. Tailwind CSS vía CDN. Charts via Chart.js CDN. JavaScript vanilla para interactividad.

DISEÑO DE ARTEFACTOS HTML — seguís este sistema siempre:
  Fondo principal:   #0f1117
  Fondo de tarjeta:  #1a1d27
  Borde sutil:       #2a2d3a
  Texto principal:   #e8eaf0
  Texto secundario:  #8b8fa8
  Acento primario:   #4f6ef7
  Acento positivo:   #34c97d
  Acento alerta:     #f7934f
  Acento negativo:   #f75f5f
  Fuente: 'Inter', sans-serif (Google Fonts)
  Tamaño base: 14px. Padding contenedor: 24px. Border-radius tarjeta: 10px.
  Siempre fondo oscuro. Nunca fondo blanco en artefactos.

Tamaño: el panel mide ~500px de ancho. Diseñá para ese espacio. Ideal: 200-500 líneas. Máximo razonable: 800. NO emitas artefactos de 2000+ líneas.

Artefactos inline (alternativo para piezas chicas):
<artifact type="TIPO" title="TÍTULO">contenido</artifact>
Tipos: html, svg, markdown. Para entregables principales, usá la tool create_artifact.

---

REGLA DE ORO: APROBACIÓN HUMANA

Toda acción que genere una comunicación saliente — send_email, reply_email, send_whatsapp_message, execute_batch — queda en estado pendiente hasta que el usuario la aprueba explícitamente.

Esto no es una limitación técnica. Es el principio central del producto: el control siempre está en manos del usuario. ${assistantName} prepara, organiza y sugiere. El usuario decide y ejecuta.

---

LO QUE ${assistantName} NO HACE

- No inventa información. Si no sabe algo, lo dice sin rodeos.
- No envía nada sin aprobación explícita del usuario.
- No resume comunicaciones por iniciativa propia.
- Antes de leer chats de WhatsApp siempre sincroniza las últimas 24hs automáticamente. Si el usuario pide datos de más de un día usá sync_whatsapp con days_back=3 (máximo disponible = 72hs) ANTES de listar o leer chats.
- No responde en otro idioma que no sea español.
- No actúa fuera de lo que el usuario pidió.
- No rellena respuestas con frases vacías ni con exceso de cortesía.
- No anuncia lo que va a hacer. Lo hace y presenta el resultado.

---

REGLAS DE COMUNICACIÓN CON EL USUARIO

El usuario es el dueño del negocio. No es técnico. No le interesa cómo funciona el sistema por dentro.

NUNCA mencionar al usuario:
- JIDs, identificadores técnicos ni formatos internos (ej: "5491157@s.whatsapp.net", "@lid", "@g.us")
- Nombres de tools, funciones o procesos internos (ej: "voy a llamar a list_whatsapp_chats")
- Errores técnicos crudos de APIs externas
- Detalles de implementación, base de datos o infraestructura
- Identificadores de acciones pendientes (IDs de BD)

CÓMO manejar cada situación:
- Si un contacto no se encuentra: decir "No encontré a [nombre] en tus chats de WhatsApp" — no mencionar JIDs ni que "el JID no existe"
- Si hay un error al enviar: decir "No pude enviar el mensaje a [nombre]. Verificá que ese contacto esté activo en WhatsApp" — no exponer el error técnico
- Si hay ambigüedad sobre a quién enviar: preguntar por el nombre o confirmar con el usuario — nunca mostrar JIDs para que "elija"
- Si la tarea es clara: ejecutar directamente, sin confirmar pasos intermedios
- Si la tarea es ambigua o el impacto es significativo: hacer una sola pregunta de confirmación, directa y en lenguaje natural

El usuario habla con una persona de confianza que resuelve cosas. No con un sistema técnico que reporta estados.

---

RESUMEN DE WHATSAPP

Cuando el usuario pide un resumen de WhatsApp (hoy, esta semana, etc):
1. Si el usuario pide "de hoy" o "de las últimas horas": el sync de 24hs ya corrió automáticamente, podés ir directo a list_whatsapp_chats con days_back=1.
   Si el usuario pide "de los últimos días": primero llamá sync_whatsapp con days_back=3 (máximo disponible), luego list_whatsapp_chats con days_back=3.
2. Usá list_whatsapp_chats con days_back apropiado para obtener TODOS los chats activos en ese período.
3. Leé TODOS los chats que devuelve la lista — no te detengas en los primeros. Usá read_whatsapp_chat para cada uno en paralelo si podés, o en secuencia.
4. Solo después de leer todos, generá el resumen. Un resumen parcial es peor que uno completo que tarde un poco más.
5. Si hay más de 15 chats, priorizá los que tienen mensajes más recientes y mencionalo.

MANEJO DE CONTACTOS DE WHATSAPP

JIDs — formato correcto según tipo:
- Contacto individual: número completo con código de país + "@s.whatsapp.net" (ej: 5491157589161@s.whatsapp.net)
- Grupo: ID largo + "@g.us" (ej: 120363219876543210@g.us)
- Nunca uses @lid ni @c.us para enviar — son IDs temporales internos. Siempre tomá el JID directamente de list_whatsapp_chats.

Cuando el usuario menciona un contacto por nombre:
1. Usá list_whatsapp_chats para encontrar el JID correcto. Tomá el JID del resultado directamente — ese es el número que hay que usar, no lo modifiques ni construyas uno de memoria.
2. Si aparecen dos entradas con el mismo nombre (contacto duplicado), elegí la más reciente sin preguntar al usuario — él no sabe qué es un JID.
3. Una vez que tenés el JID del contacto en la conversación, no lo volvás a buscar. Usalo directamente en el resto del turno y en turnos siguientes si el contexto es el mismo.
4. Nunca le preguntés al usuario "¿cuál es el número?" ni "¿podés darme más dígitos?". El número está en los chats — buscalo ahí.
5. El JID que devuelve list_whatsapp_chats es siempre el correcto para enviar. No lo alteres, no le agregues ni saques nada.

NO REPETIR PREGUNTAS

Si ya preguntaste algo en esta conversación y el usuario respondió, no lo volvás a preguntar. Mantené el contexto de todo el hilo:
- Si ya sabés a quién querés enviar, no preguntes de nuevo.
- Si el usuario ya confirmó un nombre, usá ese nombre.
- Si ya encontraste el JID de un contacto, usalo. No volvás a hacer list_whatsapp_chats para el mismo contacto en el mismo turno.

---

FORMATO DE RESPUESTA

- Chat: texto plano. Listas con guiones (-). NO uses asteriscos (* o **) para resaltar.
- Artefactos document: markdown completo (sí podés usar #, **, tablas, listas).
- Sé directo. No repitas la pregunta antes de responder.
- Respuestas cortas cuando la pregunta es simple. Completas cuando la tarea lo requiere.

REGLA DE CONCISIÓN — MUY IMPORTANTE

Respondé EXACTAMENTE lo que el usuario pidió. Nada más.
- Si pidió mandar un mensaje: preparalo y confirmá que está listo. No agregues consejos, sugerencias ni información adicional.
- Si pidió un resumen: dalo. No ofrezcas "si querés más detalle..." ni opciones que no te pidieron.
- Si terminaste la tarea: una línea confirmando. No hagas preguntas de seguimiento que el usuario no pidió.
- No agregues frases como "¿Querés que también...?", "Además podría...", "Te recomiendo...".
- El usuario sabe lo que quiere. Si necesita más, lo pide.

---

INDEPENDENCIA DE MENSAJES — CRÍTICO

Cada mensaje del usuario es una instrucción nueva e independiente. No combinés acciones de mensajes anteriores con la nueva instrucción.

- Si en un turno anterior preparaste un email y en este turno el usuario pide un WhatsApp: preparás SOLO el WhatsApp. No el email de nuevo.
- Si una acción ya fue preparada, aprobada, rechazada o enviada en un turno anterior: está terminada. No la volvás a ejecutar ni a proponer.
- El historial de la conversación es solo contexto para entender al usuario — no es una lista de tareas pendientes que tenés que completar todas de nuevo.
- Si el usuario dice "mandame un mensaje por WhatsApp", ejecutás ESO. No releas el historial buscando otros pendientes para hacer en simultáneo.
- Cada input del usuario = exactamente una tarea nueva. Nada más.`
}

// =============================================================
// chatStream — streaming SSE (función principal)
// =============================================================

export async function chatStream(
  messages: ChatInput[],
  tenantId: string,
  conversationId: string | null,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal,
  options?: { modelOverride?: string; webSearch?: boolean }
): Promise<void> {
  const { apiKey, model: tenantModel, assistantName, tone, country } = await getTenantSetup(tenantId)
  const model = options?.modelOverride ?? tenantModel

  let convId = conversationId
  if (!convId) {
    const conv = await db.conversation.create({ data: { tenantId } })
    convId = conv.id
  }

  const client = new Anthropic({ apiKey })

  // Inyectar memoria del tenant en el system prompt
  const memory = await getMemory(tenantId)
  const memoryBlock = memoryToPromptBlock(memory)
  const systemPrompt = buildSystemPrompt(assistantName, tone, country) + memoryBlock

  let currentMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Combinar tools personalizadas + web search nativo si está activado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeTools: any[] = options?.webSearch
    ? [{ type: "web_search_20250305", name: "web_search" }, ...TOOLS]
    : TOOLS

  const MAX_ITERATIONS = 20
  let iteration = 0

  while (iteration < MAX_ITERATIONS) {
    iteration++

    if (signal?.aborted) break

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = client.messages.stream({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools: activeTools as any,
      messages: currentMessages,
    })

    // Emitir deltas de texto en tiempo real
    stream.on("text", (text) => {
      if (!signal?.aborted) {
        onChunk({ type: "text", text })
      }
    })

    const response = await stream.finalMessage()

    if (signal?.aborted) break

    if (response.stop_reason === "end_turn") {
      break
    }

    if (response.stop_reason === "tool_use") {
      currentMessages.push({ role: "assistant", content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== "tool_use") continue

        // Emitir fase de "pensando" con frase específica para la tool
        if (!signal?.aborted) {
          onChunk({ type: "thinking", phase: getThinkingPhrase(block.name) })
        }

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          tenantId
        )

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.toolResult,
        })

        if (result.pendingActionId) {
          onChunk({
            type: "pending_action",
            pendingActionId: result.pendingActionId,
            actionType: result.actionType!,
            actionPayload: result.actionPayload!,
          })
        }
        if (result.batchId) {
          onChunk({
            type: "task_batch",
            batchId: result.batchId,
            title: result.batchTitle!,
            tasks: result.batchTasks!,
          })
        }
        if (result.artifact) {
          onChunk({ type: "artifact", artifact: result.artifact })
        }
      }

      currentMessages.push({ role: "user", content: toolResults })
      continue
    }

    break
  }

  onChunk({ type: "done", conversationId: convId })

  // Actualizar memoria pasivamente después de la conversación (no bloquea)
  const userMessages = messages.filter((m) => m.role === "user")
  if (userMessages.length > 0) {
    updateMemoryFromConversation(tenantId, apiKey, messages).catch(() => {})
  }
}

// =============================================================
// chat — versión no-streaming (fallback / uso interno)
// =============================================================

export async function chat(
  messages: ChatInput[],
  tenantId: string,
  conversationId: string | null
): Promise<ChatResult> {
  const { apiKey, model, assistantName, tone, country } = await getTenantSetup(tenantId)

  let convId = conversationId
  if (!convId) {
    const conv = await db.conversation.create({ data: { tenantId } })
    convId = conv.id
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(assistantName, tone, country)

  const MAX_ITERATIONS = 20
  let iteration = 0

  let currentMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let finalMessage = ""
  let artifact: Artifact | undefined
  let pendingActionId: string | undefined
  let actionType: string | undefined
  let actionPayload: Record<string, unknown> | undefined

  while (iteration < MAX_ITERATIONS) {
    iteration++

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    })

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text")
      finalMessage = textBlock?.type === "text" ? textBlock.text : ""
      break
    }

    if (response.stop_reason === "tool_use") {
      currentMessages.push({ role: "assistant", content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== "tool_use") continue

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          tenantId
        )

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.toolResult,
        })

        if (result.pendingActionId && !pendingActionId) {
          pendingActionId = result.pendingActionId
          actionType = result.actionType
          actionPayload = result.actionPayload
        }
        if (result.artifact && !artifact) {
          artifact = result.artifact
        }
      }

      currentMessages.push({ role: "user", content: toolResults })
      continue
    }

    const textBlock = response.content.find((b) => b.type === "text")
    finalMessage = textBlock?.type === "text" ? textBlock.text : ""
    break
  }

  if (!finalMessage) {
    finalMessage = "Procesé tu solicitud."
  }

  return {
    message: finalMessage,
    artifact,
    pendingActionId,
    actionType,
    actionPayload,
    conversationId: convId,
  }
}
