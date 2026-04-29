import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"
import { getInstanceName } from "@/lib/evolution"

// GET /api/whatsapp/debug — muestra respuesta cruda de Evolution API para diagnóstico
// Solo accesible por el usuario autenticado
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [baseUrl, apiKey] = await Promise.all([
    getConfig("evolutionUrl"),
    getConfig("evolutionKey"),
  ])
  const headers = { "Content-Type": "application/json", apikey: apiKey }
  const instanceName = getInstanceName(session.user.tenantId)
  const base = baseUrl.replace(/\/$/, "")

  // Probamos distintos endpoints para ver cuál responde y qué formato devuelve
  const results: Record<string, unknown> = {}

  // 1. findChats
  try {
    const r = await fetch(`${base}/chat/findChats/${instanceName}`, {
      method: "POST", headers, body: JSON.stringify({}),
    })
    const raw = await r.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    const arr = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>)?.chats ?? parsed
    results.findChats = {
      status: r.status,
      firstItem: Array.isArray(arr) ? arr[0] : arr,
      total: Array.isArray(arr) ? arr.length : "N/A",
    }
  } catch (e) { results.findChats = { error: String(e) } }

  // 2. findMessages (sin filtro, límite 5 para ver el formato)
  try {
    const r = await fetch(`${base}/chat/findMessages/${instanceName}`, {
      method: "POST", headers, body: JSON.stringify({ where: {}, limit: 5 }),
    })
    const raw = await r.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    results.findMessages = { status: r.status, raw: parsed }
  } catch (e) { results.findMessages = { error: String(e) } }

  // 3. Endpoint alternativo fetchMessages (algunas versiones de Evolution)
  try {
    const r = await fetch(`${base}/message/fetchMessages/${instanceName}?limit=5`, {
      method: "GET", headers,
    })
    const raw = await r.text()
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    results.fetchMessages_GET = { status: r.status, raw: parsed }
  } catch (e) { results.fetchMessages_GET = { error: String(e) } }

  return NextResponse.json({ instance: instanceName, results })
}
