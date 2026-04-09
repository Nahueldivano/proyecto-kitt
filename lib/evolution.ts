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

export async function deleteInstance(tenantId: string): Promise<void> {
  const [baseUrl, headers] = await Promise.all([getBaseUrl(), getHeaders()])
  const instanceName = getInstanceName(tenantId)

  await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers,
  })
}
