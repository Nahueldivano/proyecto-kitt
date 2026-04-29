import { getConfig } from "@/lib/config"

// =============================================================
// Evolution API — WhatsApp integration
// Cada tenant tiene su instancia: kitt_{tenantId}
// =============================================================

async function getHeaders(): Promise<HeadersInit> {
  const apiKey = await getConfig("evolutionKey")
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
  }
}

async function getBaseUrl(): Promise<string> {
  const url = await getConfig("evolutionUrl")
  return url.replace(/\/$/, "")
}

export function getInstanceName(tenantId: string): string {
  return `kitt_${tenantId}`
}

export async function createInstance(tenantId: string): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  const res = await fetch(`${baseUrl}/instance/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution createInstance failed: ${err}`)
  }
}

export async function getQRCode(
  tenantId: string
): Promise<{ qrcode: string } | null> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  // Intentar conectar la instancia primero
  const connectRes = await fetch(
    `${baseUrl}/instance/connect/${instanceName}`,
    { method: "GET", headers }
  )

  if (!connectRes.ok) {
    // Instancia no existe, crearla
    await createInstance(tenantId)
    // Volver a intentar
    const retryRes = await fetch(
      `${baseUrl}/instance/connect/${instanceName}`,
      { method: "GET", headers }
    )
    if (!retryRes.ok) return null
    const data = await retryRes.json()
    return data?.base64 ? { qrcode: data.base64 } : null
  }

  const data = await connectRes.json()
  return data?.base64 ? { qrcode: data.base64 } : null
}

export async function getStatus(
  tenantId: string
): Promise<"connected" | "disconnected" | "connecting"> {
  try {
    const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
    const instanceName = getInstanceName(tenantId)

    const res = await fetch(
      `${baseUrl}/instance/connectionState/${instanceName}`,
      { method: "GET", headers }
    )

    if (!res.ok) return "disconnected"

    const data = await res.json()
    const state = data?.instance?.state ?? data?.state

    if (state === "open") return "connected"
    if (state === "connecting" || state === "close") return "connecting"
    return "disconnected"
  } catch {
    return "disconnected"
  }
}

export async function sendTextMessage(
  tenantId: string,
  to: string,
  message: string
): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number: to,
      text: message,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution sendTextMessage failed: ${err}`)
  }
}

export async function reconnect(tenantId: string): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  // Desconectar y reconectar
  await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
    method: "DELETE",
    headers,
  })

  await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
    method: "GET",
    headers,
  })
}

// =============================================================
// Lectura de chats e histórico (Baileys via Evolution API)
// =============================================================

export interface EvolutionChat {
  jid: string
  name: string | null
  unreadCount?: number
  lastMessageTimestamp?: number
}

export interface EvolutionMessage {
  externalId: string
  chatJid: string
  contactName: string | null
  fromMe: boolean
  body: string
  messageType: string
  timestamp: Date
  raw: unknown
}

// Extrae el contenido textual de un mensaje Baileys según su tipo
function extractMessageContent(messageData: Record<string, unknown>): { body: string; type: string } {
  const m = (messageData?.message ?? {}) as Record<string, unknown>
  if (m.conversation) return { body: String(m.conversation), type: "text" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).extendedTextMessage?.text) return { body: String((m as any).extendedTextMessage.text), type: "text" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).imageMessage) return { body: (m as any).imageMessage.caption ?? "[imagen]", type: "image" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).videoMessage) return { body: (m as any).videoMessage.caption ?? "[video]", type: "video" }
  if (m.audioMessage) return { body: "[audio]", type: "audio" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).documentMessage) return { body: (m as any).documentMessage.fileName ?? "[documento]", type: "document" }
  if (m.stickerMessage) return { body: "[sticker]", type: "sticker" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).locationMessage) return { body: "[ubicación]", type: "location" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((m as any).contactMessage) return { body: "[contacto]", type: "contact" }
  return { body: "", type: "other" }
}

// Normaliza un mensaje raw de Evolution/Baileys al formato interno
export function normalizeEvolutionMessage(raw: Record<string, unknown>): EvolutionMessage | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any
  const key = r.key ?? {}
  const externalId = String(key.id ?? r.id ?? "")
  const chatJid = String(key.remoteJid ?? r.remoteJid ?? r.from ?? "")
  if (!externalId || !chatJid) return null

  const fromMe = Boolean(key.fromMe ?? r.fromMe ?? false)
  const contactName = r.pushName ?? r.notifyName ?? null
  const tsRaw = r.messageTimestamp ?? r.timestamp ?? Date.now() / 1000
  const tsNum = typeof tsRaw === "string" ? parseInt(tsRaw, 10) : Number(tsRaw)
  const timestamp = new Date(tsNum > 1e12 ? tsNum : tsNum * 1000)

  const { body, type } = extractMessageContent(r)
  if (!body) return null

  return {
    externalId,
    chatJid,
    contactName,
    fromMe,
    body,
    messageType: type,
    timestamp,
    raw,
  }
}

// Lista los chats existentes en la instancia conectada
export async function findChats(tenantId: string): Promise<EvolutionChat[]> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  const res = await fetch(`${baseUrl}/chat/findChats/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  })

  if (!res.ok) return []
  const data = await res.json()
  const chats = Array.isArray(data) ? data : data?.chats ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (chats as any[])
    .map((c) => {
      const jid = c.id ?? c.remoteJid ?? c.jid
      if (!jid) return null
      return {
        jid: String(jid),
        name: c.name ?? c.pushName ?? c.subject ?? null,
        unreadCount: typeof c.unreadCount === "number" ? c.unreadCount : undefined,
        lastMessageTimestamp:
          typeof c.lastMessageTimestamp === "number" ? c.lastMessageTimestamp : undefined,
      } as EvolutionChat
    })
    .filter((c): c is EvolutionChat => c !== null)
}

// Trae el histórico de mensajes desde Evolution. Si chatJid se especifica,
// filtra por ese chat. Si no, trae todos los recientes.
export async function findMessages(
  tenantId: string,
  options: { chatJid?: string; limit?: number } = {}
): Promise<EvolutionMessage[]> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  const limit = options.limit ?? 100
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {}
  if (options.chatJid) where.key = { remoteJid: options.chatJid }

  const res = await fetch(`${baseUrl}/chat/findMessages/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ where, limit }),
  })

  if (!res.ok) return []
  const data = await res.json()
  // Evolution puede devolver { messages: { records: [...] } } o un array directo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: any[] = Array.isArray(data)
    ? data
    : data?.messages?.records ?? data?.messages ?? data?.records ?? []

  return records
    .map((r) => normalizeEvolutionMessage(r))
    .filter((m): m is EvolutionMessage => m !== null)
}

export async function deleteInstance(tenantId: string): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers,
  })
}
