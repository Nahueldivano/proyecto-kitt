import { safeGet, safeSet, getRedis } from "@/lib/redis"
import Anthropic from "@anthropic-ai/sdk"

// =============================================================
// KITT Memory — aprende sobre el usuario con cada conversación
// Guardado en Redis con TTL de 90 días
// =============================================================

const MEMORY_TTL = 60 * 60 * 24 * 90 // 90 días en segundos
export const MAX_FACTS = 40 // máximo de hechos a retener

export interface TrackedEntity {
  type: "whatsapp" | "email"
  identifier: string
  description: string
}

export interface MemoryFact {
  id: string
  fact: string
  category: "preferencia" | "negocio" | "contacto" | "comportamiento" | "objetivo" | "otro"
  learnedAt: string // ISO date
  source: "onboarding" | "conversacion"
}

export interface TenantMemory {
  facts: MemoryFact[]
  lastTopics: string[]
  updatedAt: string
}

function memoryKey(tenantId: string): string {
  return `kitt:memory:${tenantId}`
}

export async function getMemory(tenantId: string): Promise<TenantMemory> {
  const raw = await safeGet(memoryKey(tenantId))
  if (!raw) return { facts: [], lastTopics: [], updatedAt: new Date().toISOString() }
  try {
    return JSON.parse(raw) as TenantMemory
  } catch {
    return { facts: [], lastTopics: [], updatedAt: new Date().toISOString() }
  }
}

export async function clearMemory(tenantId: string): Promise<void> {
  try {
    await getRedis().del(memoryKey(tenantId))
  } catch {
    // Redis no disponible — no-op
  }
}

export async function saveMemory(tenantId: string, memory: TenantMemory): Promise<void> {
  // Mantener solo los MAX_FACTS más recientes
  memory.facts = memory.facts.slice(-MAX_FACTS)
  memory.updatedAt = new Date().toISOString()
  await safeSet(memoryKey(tenantId), JSON.stringify(memory), MEMORY_TTL)
}

/**
 * Después de cada conversación, extrae hechos nuevos con Claude Haiku
 * y los fusiona con la memoria existente.
 */
export async function updateMemoryFromConversation(
  tenantId: string,
  apiKey: string,
  conversation: { role: string; content: string }[]
): Promise<void> {
  if (conversation.length < 2 || !apiKey) return

  try {
    const client = new Anthropic({ apiKey })

    const conversationText = conversation
      .map((m) => `${m.role === "user" ? "Usuario" : "KITT"}: ${m.content}`)
      .join("\n")

    const extractionPrompt = `Analizá esta conversación entre un usuario y su asistente KITT.
Extraé SOLO hechos nuevos, concretos y útiles sobre el usuario o su negocio que valga la pena recordar en el futuro.
No incluyas hechos triviales, preguntas sin respuesta, ni cosas que KITT ya debería saber del onboarding.
Máximo 5 hechos por conversación.

Si no hay nada nuevo importante, respondé con: []

Conversación:
${conversationText}

Respondé ÚNICAMENTE con un JSON array:
[
  {"fact": "...", "category": "negocio|contacto|preferencia|comportamiento|objetivo|otro"}
]`

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: extractionPrompt }],
    })

    const text = response.content.find((b) => b.type === "text")?.text ?? "[]"

    // Extraer JSON del response (puede venir con texto extra)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const extracted = JSON.parse(jsonMatch[0]) as Array<{ fact: string; category: string }>
    if (!Array.isArray(extracted) || extracted.length === 0) return

    const memory = await getMemory(tenantId)

    const newFacts: MemoryFact[] = extracted.map((e) => ({
      id: Math.random().toString(36).slice(2, 9),
      fact: e.fact,
      category: (e.category as MemoryFact["category"]) ?? "otro",
      learnedAt: new Date().toISOString(),
      source: "conversacion",
    }))

    // Evitar duplicados exactos
    const existingFacts = new Set(memory.facts.map((f) => f.fact.toLowerCase()))
    const uniqueNew = newFacts.filter((f) => !existingFacts.has(f.fact.toLowerCase()))

    // Extraer temas de la conversación
    const topics = conversation
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content.slice(0, 60))

    memory.facts = [...memory.facts, ...uniqueNew]
    memory.lastTopics = topics

    await saveMemory(tenantId, memory)
  } catch (err) {
    // No bloquear la respuesta principal si falla la memoria
    console.warn("[memory] updateMemoryFromConversation error:", err)
  }
}

/**
 * Convierte la memoria en un bloque de texto para inyectar en el system prompt.
 */
export function memoryToPromptBlock(memory: TenantMemory): string {
  if (memory.facts.length === 0) return ""

  const lines = memory.facts
    .slice(-20) // últimos 20 hechos en el prompt
    .map((f) => `- ${f.fact}`)
    .join("\n")

  return `\nCosas que ya sé de este usuario (aprendidas en conversaciones previas):\n${lines}`
}
