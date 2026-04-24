import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { getMemory, saveMemory, type MemoryFact, type TrackedEntity } from "@/lib/memory"
import { decrypt } from "@/lib/crypto"
import { listUnreadEmails } from "@/lib/gmail"

// =============================================================
// POST /api/cron/sync  — llamado por el scheduler externo
// Requiere: Authorization: Bearer <CRON_SECRET>
// =============================================================

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: { tenantId: string; newFacts: number }[] = []
  const errors: { tenantId: string; error: string }[] = []

  // Todos los tenants que tengan trackedEntities configuradas
  const tenants = await db.tenant.findMany({
    select: { id: true, config: true },
  })

  for (const tenant of tenants) {
    const config = (tenant.config ?? {}) as Record<string, unknown>
    const trackedEntities = (config.trackedEntities ?? []) as TrackedEntity[]
    if (trackedEntities.length === 0) continue

    // API key del tenant
    const rawKey = config.anthropicApiKey as string | undefined
    if (!rawKey) continue
    const apiKey = decrypt(rawKey)

    // Estado de conexiones
    const [waSession, gmailConn] = await Promise.all([
      db.whatsappSession.findUnique({
        where: { tenantId: tenant.id },
        select: { status: true },
      }),
      db.gmailConnection.findUnique({
        where: { tenantId: tenant.id },
        select: { id: true },
      }),
    ])

    // Recolectar mensajes relevantes según entidades rastreadas
    const snippets: string[] = []
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // últimas 24 h

    for (const entity of trackedEntities) {
      if (entity.type === "whatsapp" && waSession?.status === "connected") {
        const msgs = await db.message.findMany({
          where: {
            conversation: { tenantId: tenant.id },
            role: "user",
            createdAt: { gte: since },
            content: { contains: entity.identifier, mode: "insensitive" },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
        if (msgs.length > 0) {
          snippets.push(
            `WhatsApp — ${entity.description}:\n` +
              msgs.map((m) => `  • ${m.content.slice(0, 180)}`).join("\n")
          )
        }
      }

      if (entity.type === "email" && gmailConn) {
        try {
          const emails = await listUnreadEmails(tenant.id, 15)
          const relevant = emails.filter(
            (e) =>
              e.from.toLowerCase().includes(entity.identifier.toLowerCase()) ||
              e.subject.toLowerCase().includes(entity.identifier.toLowerCase())
          )
          if (relevant.length > 0) {
            snippets.push(
              `Email — ${entity.description}:\n` +
                relevant
                  .map((e) => `  • De: ${e.from} | Asunto: ${e.subject} | ${e.snippet.slice(0, 120)}`)
                  .join("\n")
            )
          }
        } catch (emailErr) {
          console.warn(`[cron/sync] Gmail error tenant ${tenant.id}:`, emailErr)
        }
      }
    }

    if (snippets.length === 0) continue

    // Extraer hechos con Claude Haiku
    try {
      const client = new Anthropic({ apiKey })

      const prompt = `Analizá estos mensajes recientes del negocio del usuario y extraé SOLO hechos nuevos, concretos y útiles que KITT debería recordar.
No incluyas hechos triviales ni conversaciones sin información valiosa.
Máximo 5 hechos por ejecución.
Si no hay nada importante, respondé con [].

Mensajes:
${snippets.join("\n\n")}

Respondé ÚNICAMENTE con un JSON array:
[{"fact": "...", "category": "negocio|contacto|preferencia|comportamiento|objetivo|otro"}]`

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      })

      const text = response.content.find((b) => b.type === "text")?.text ?? "[]"
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue

      const extracted = JSON.parse(jsonMatch[0]) as Array<{ fact: string; category: string }>
      if (!Array.isArray(extracted) || extracted.length === 0) continue

      const memory = await getMemory(tenant.id)
      const existingFacts = new Set(memory.facts.map((f) => f.fact.toLowerCase()))

      const newFacts: MemoryFact[] = extracted
        .filter((e) => !existingFacts.has(e.fact.toLowerCase()))
        .map((e) => ({
          id: Math.random().toString(36).slice(2, 9),
          fact: e.fact,
          category: (e.category as MemoryFact["category"]) ?? "otro",
          learnedAt: new Date().toISOString(),
          source: "conversacion",
        }))

      if (newFacts.length > 0) {
        memory.facts = [...memory.facts, ...newFacts]
        await saveMemory(tenant.id, memory)
        results.push({ tenantId: tenant.id, newFacts: newFacts.length })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido"
      console.error(`[cron/sync] Error tenant ${tenant.id}:`, err)
      errors.push({ tenantId: tenant.id, error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  })
}

// GET para health-check del scheduler
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() })
}
