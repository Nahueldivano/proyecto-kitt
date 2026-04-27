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

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "pending_action"; pendingActionId: string; actionType: string; actionPayload: Record<string, unknown> }
  | { type: "done"; conversationId: string }

// =============================================================
// Definición de tools
// =============================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_unread_emails",
    description: "Lista los emails no leídos de la casilla conectada del usuario",
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
    description: "Lee el contenido completo de un email por su ID",
    input_schema: {
      type: "object" as const,
      properties: {
        message_id: {
          type: "string",
          description: "ID del mensaje de Gmail",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "send_email",
    description:
      "Prepara un email para enviar. SIEMPRE requiere aprobación del usuario antes de enviarse.",
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
    description:
      "Prepara una respuesta a un email. SIEMPRE requiere aprobación del usuario antes de enviarse.",
    input_schema: {
      type: "object" as const,
      properties: {
        thread_id: { type: "string", description: "ID del hilo de Gmail" },
        to: { type: "string", description: "Email del destinatario" },
        subject: { type: "string", description: "Asunto original del email" },
        body: { type: "string", description: "Cuerpo de la respuesta" },
      },
      required: ["thread_id", "to", "subject", "body"],
    },
  },
  {
    name: "list_whatsapp_messages",
    description: "Consulta mensajes de WhatsApp almacenados. Busca por contacto, grupo o contenido.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Texto de búsqueda: nombre de contacto, grupo, o keywords",
        },
        limit: {
          type: "number",
          description: "Máximo de mensajes a devolver (default 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "send_whatsapp_message",
    description:
      "Prepara un mensaje de WhatsApp para enviar. SIEMPRE requiere aprobación del usuario antes de enviarse.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: {
          type: "string",
          description: "Número de teléfono o ID del grupo de WhatsApp",
        },
        message: { type: "string", description: "Texto del mensaje" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "create_artifact",
    description:
      "Crea un artefacto visual: documento, página HTML, gráfico, o código. Se muestra en un panel lateral.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["document", "html", "chart", "code"],
          description: "Tipo de artefacto",
        },
        title: { type: "string", description: "Título del artefacto" },
        content: {
          type: "string",
          description: "Contenido del artefacto (texto, HTML, código, etc.)",
        },
        language: {
          type: "string",
          description: "Lenguaje de programación (solo para type=code)",
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
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  tenantId: string
): Promise<ToolCallResult> {
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

    case "list_whatsapp_messages": {
      const query = (toolInput.query as string) ?? ""
      const limit = (toolInput.limit as number) ?? 20

      const messages = await db.message.findMany({
        where: {
          conversation: { tenantId },
          role: "user",
          ...(query
            ? { content: { contains: query, mode: "insensitive" } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { conversation: { select: { id: true } } },
      })

      if (messages.length === 0) {
        return {
          toolResult: query
            ? `No se encontraron mensajes de WhatsApp con "${query}".`
            : "No hay mensajes de WhatsApp almacenados aún.",
        }
      }

      const formatted = messages
        .map(
          (m) =>
            `[${m.createdAt.toLocaleString("es-AR")}] ${m.content.substring(0, 200)}`
        )
        .join("\n")

      return { toolResult: `Mensajes de WhatsApp:\n\n${formatted}` }
    }

    case "send_whatsapp_message": {
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
  return { apiKey, model, assistantName, tone, tenantConfig }
}

function buildSystemPrompt(assistantName: string, tone: string): string {
  return `Sos ${assistantName}, el asistente empresarial de IA del usuario. Lo ayudás a gestionar comunicaciones (emails, WhatsApp), analizar documentos y producir contenido (reportes, planes, código, dashboards, etc.).

Tono: ${tone === "professional" ? "profesional y conciso" : "amigable y cercano"}. Idioma: español argentino siempre.

═══════════════════════════════════════════
FLUJO DE TRABAJO — pensar primero, después actuar
═══════════════════════════════════════════

1. Si la tarea tiene UN solo paso evidente (responder una pregunta corta, leer un email, mandar un mensaje simple): ejecutala directo.

2. Si la tarea tiene MÚLTIPLES pasos, dependencias o requiere usar varias tools:
   - Primero escribí un plan corto (2-4 líneas, sin floritura) explicando qué vas a hacer.
   - Después ejecutá las tools en orden.
   - Al final, resumí lo hecho en 1-2 líneas.

3. Si después de ejecutar una tool descubrís algo que cambia el plan, actualizá el plan en una línea y seguí.

Tenés hasta 20 llamadas a tools encadenadas por turno — usalas. Si necesitás listar emails → leer 3 → redactar respuestas, hacelo todo en el mismo turno sin pedir confirmación entre paso y paso.

═══════════════════════════════════════════
ARTEFACTOS — usalos AGRESIVAMENTE
═══════════════════════════════════════════

create_artifact muestra contenido en un panel lateral. Es la forma correcta de entregar cualquier salida sustancial. Usalo SIEMPRE que apliquen estos casos:

- Documentos / reportes / planes de más de ~200 palabras → type: "document"
- Cualquier código, snippet o config → type: "code" (con language)
- Tablas, listas largas, comparativas estructuradas → type: "document" en markdown
- Dashboards, formularios, calculadoras, mockups, simuladores, visualizaciones → type: "html"
- Análisis de un documento que el usuario subió y que requiere respuesta extensa → type: "document"

Regla simple: si vas a responder con más de ~15 líneas de contenido estructurado, hacelo como artefacto. El chat queda para la conversación; el artefacto para el entregable.

ARTEFACTOS HTML INTERACTIVOS:
Cuando uses type: "html", podés escribir HTML completo con <script> y <style> embebidos. Tenés disponible Tailwind CSS vía CDN automáticamente — escribí markup limpio con clases de Tailwind (no inline styles salvo casos puntuales). Podés usar JavaScript vanilla para interactividad: event listeners, fetch a APIs públicas, manipulación del DOM, formularios, etc. Para charts simples, usá Chart.js vía CDN (https://cdn.jsdelivr.net/npm/chart.js).

Si el HTML ya empieza con <!DOCTYPE> o <html>, se usa tal cual. Si entregás solo el <body> o un fragmento, se envuelve automáticamente con head + Tailwind.

ARTEFACTOS DE CÓDIGO:
Para code, usá language exacto: "typescript", "javascript", "python", "sql", "bash", "json", "yaml", "tsx", etc.

═══════════════════════════════════════════
COMUNICACIONES (emails / WhatsApp)
═══════════════════════════════════════════

- Nunca envíes un email o mensaje sin usar la tool correspondiente.
- Las acciones de envío (send_email, reply_email, send_whatsapp_message) SIEMPRE quedan pending y requieren aprobación humana — esto es por diseño, no es un bug.
- Cuando listes emails o mensajes, presentá la info clara y estructurada.

═══════════════════════════════════════════
FORMATO
═══════════════════════════════════════════

- En el chat: texto plano o guiones para listas. NO uses asteriscos (* o **) para resaltar.
- En artefactos type: "document": markdown completo (sí podés usar #, **, listas, tablas).
- Sé directo. No repitas la pregunta del usuario antes de responder. No prometas, hacé.`
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
  const { apiKey, model: tenantModel, assistantName, tone } = await getTenantSetup(tenantId)
  const model = options?.modelOverride ?? tenantModel

  let convId = conversationId
  if (!convId) {
    const conv = await db.conversation.create({ data: { tenantId } })
    convId = conv.id
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(assistantName, tone)

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
      max_tokens: 16384,
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
}

// =============================================================
// chat — versión no-streaming (fallback / uso interno)
// =============================================================

export async function chat(
  messages: ChatInput[],
  tenantId: string,
  conversationId: string | null
): Promise<ChatResult> {
  const { apiKey, model, assistantName, tone } = await getTenantSetup(tenantId)

  let convId = conversationId
  if (!convId) {
    const conv = await db.conversation.create({ data: { tenantId } })
    convId = conv.id
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(assistantName, tone)

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
      max_tokens: 16384,
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
