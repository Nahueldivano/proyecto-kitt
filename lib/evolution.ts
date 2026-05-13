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

// Resuelve el número de WhatsApp correcto usando checkNumberStatus de Evolution.
// Dado un JID o número, devuelve el JID verificado por Evolution, o null si no existe en WA.
async function resolveWhatsAppNumber(
  baseUrl: string,
  headers: HeadersInit,
  instanceName: string,
  to: string
): Promise<string | null> {
  const phone = to.replace(/@[^@]+$/, "")
  try {
    const res = await fetch(`${baseUrl}/chat/whatsappNumbers/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ numbers: [phone] }),
    })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any[]
    if (!Array.isArray(data) || data.length === 0) return null
    const entry = data[0]
    // Evolution devuelve { exists: true, jid: "549...@s.whatsapp.net" } o similar
    if (!entry.exists && !entry.jid) return null
    const jid = entry.jid ?? entry.remoteJid ?? entry.number
    return jid ? String(jid).replace(/@[^@]+$/, "") : null
  } catch {
    return null
  }
}

export async function sendTextMessage(
  tenantId: string,
  to: string,
  message: string
): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  // Grupos @g.us: JID completo siempre
  if (to.endsWith("@g.us")) {
    const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ number: to, text: message }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Evolution sendTextMessage failed (${res.status}): ${err}`)
    }
    return
  }

  // Contacto 1:1: resolver el número real vía checkNumberStatus
  const numberPure = to.replace(/@[^@]+$/, "")
  console.log(`[evolution] sendTextMessage 1:1 — original_to:${to} phone:${numberPure}`)

  // Paso 1: verificar con Evolution cuál es el JID real del número
  const resolvedNumber = await resolveWhatsAppNumber(baseUrl, headers, instanceName, to)
  const numberToSend = resolvedNumber ?? numberPure

  console.log(`[evolution] resolved number: ${numberToSend}`)

  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: numberToSend, text: message }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[evolution] sendTextMessage failed — number:${numberToSend} original:${to} status:${res.status} body:${err}`)
    throw new Error(`Evolution sendTextMessage failed (${res.status}): ${err}`)
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
  chatName: string | null
  fromMe: boolean
  body: string
  messageType: string
  timestamp: Date
  messageKey: { id: string; remoteJid: string; fromMe: boolean }
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
    chatName: null, // filled by sync/webhook from findGroupNames()
    fromMe,
    body,
    messageType: type,
    timestamp,
    messageKey: { id: externalId, remoteJid: chatJid, fromMe },
    raw,
  }
}

// Devuelve un mapa JID → nombre de grupo para todos los @g.us del tenant.
// Reutiliza findChats() que ya extrae c.subject como nombre de grupo.
export async function findGroupNames(tenantId: string): Promise<Map<string, string>> {
  const chats = await findChats(tenantId)
  const map = new Map<string, string>()
  for (const c of chats) {
    if (c.jid.endsWith("@g.us") && c.name) {
      map.set(c.jid, c.name)
    }
  }
  return map
}

// Devuelve un mapa JID → nombre del agenda (pushName/notify) leyendo el
// endpoint findContacts de Evolution. Sirve para enriquecer chats individuales
// que vienen sin name/subject.
export async function findContacts(tenantId: string): Promise<Map<string, string>> {
  try {
    const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
    const instanceName = getInstanceName(tenantId)
    const res = await fetch(`${baseUrl}/chat/findContacts/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })
    if (!res.ok) return new Map()
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacts: any[] = Array.isArray(data) ? data : data?.contacts ?? data?.records ?? []
    const map = new Map<string, string>()
    let withAgendaName = 0
    let withPushNameOnly = 0

    for (const c of contacts) {
      const jid = c.remoteJid ?? c.jid ?? c.id
      if (!jid || !String(jid).includes("@")) continue
      const jidStr = String(jid)

      // c.name / c.notify = nombre que el usuario guardó en su agenda del teléfono
      // c.pushName = nombre que el contacto se puso a sí mismo en WA
      const agendaName = c.name ?? c.notify ?? c.verifiedName
      const name = agendaName ?? c.pushName
      if (!name) continue

      if (agendaName) withAgendaName++
      else withPushNameOnly++

      map.set(jidStr, String(name))

      // Guardar también por número puro para matchear JIDs @lid o variantes
      const phone = jidStr.replace(/@.+$/, "")
      if (phone && !map.has(phone)) {
        map.set(phone, String(name))
      }
    }

    console.log(`[evolution] findContacts: ${map.size} contacts — ${withAgendaName} with agenda name, ${withPushNameOnly} pushName only`)
    return map
  } catch (err) {
    console.warn("[evolution] findContacts error:", err)
    return new Map()
  }
}

// Descarga el contenido base64 de un mensaje multimedia (audio, imagen, etc.)
export async function getMessageMediaBase64(
  tenantId: string,
  messageKey: { id: string; remoteJid: string; fromMe: boolean }
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
    const instanceName = getInstanceName(tenantId)
    const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.base64) return null
    return { base64: String(data.base64), mimetype: String(data.mimetype ?? "audio/ogg") }
  } catch (err) {
    console.warn("[evolution] getMessageMediaBase64 error:", err)
    return null
  }
}

// Lista los chats más recientes de la instancia (máximo 20).
// Prioriza remoteJid sobre id interno de Evolution.
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

  // Cargamos en paralelo el mapa de contactos del agenda para chats 1:1
  const contactsMap = await findContacts(tenantId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = (chats as any[])
    .map((c) => {
      // remoteJid es el JID real de WhatsApp (5491...@s.whatsapp.net o @g.us)
      // id / _id puede ser el ObjectId interno de Evolution — lo usamos solo como fallback
      const jid = c.remoteJid ?? c.jid ?? (typeof c.id === "string" && c.id.includes("@") ? c.id : null)
      if (!jid) return null
      const jidStr = String(jid)
      const ts = c.lastMessageTimestamp ?? c.updatedAt ?? 0
      const rawName = c.name ?? c.subject ?? c.verifiedName ?? null
      // Para 1:1: preferir nombre de agenda; para grupos: usar subject/name del chat
      const phone = jidStr.replace(/@.+$/, "")
      const agendaName = contactsMap.get(jidStr) ?? contactsMap.get(phone) ?? null
      const name = agendaName ?? rawName ?? c.pushName ?? null
      return {
        jid: jidStr,
        name,
        lastMessageTimestamp: typeof ts === "number" ? ts : 0,
      } as EvolutionChat
    })
    .filter((c): c is EvolutionChat => c !== null && c.jid.includes("@"))

  // Ordenar por actividad más reciente y devolver hasta 200 chats
  return mapped
    .sort((a, b) => (b.lastMessageTimestamp ?? 0) - (a.lastMessageTimestamp ?? 0))
    .slice(0, 200)
}

// Trae mensajes en bloque sin filtrar por chat (una sola llamada).
// El llamador filtra por whitelist y ventana de tiempo.
// limit controla cuántos mensajes totales pide a Evolution.
export async function findMessages(
  tenantId: string,
  options: { limit?: number } = {}
): Promise<EvolutionMessage[]> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  // Pedimos sin filtro de chat — Evolution devuelve los más recientes globalmente
  const limit = options.limit ?? 1000
  const res = await fetch(`${baseUrl}/chat/findMessages/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ where: {}, limit }),
  })

  if (!res.ok) {
    console.warn(`[evolution] findMessages ${res.status}: ${await res.text().catch(() => "")}`)
    return []
  }
  const data = await res.json()

  // Evolution puede devolver { messages: { records: [...] } } | { messages: [...] } | [...]
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
