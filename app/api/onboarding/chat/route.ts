import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { getConfig } from "@/lib/config"
import { decrypt } from "@/lib/crypto"

// =============================================================
// System prompt del entrevistador
// =============================================================

const ONBOARDING_SYSTEM = `Sos el configurador inicial de KITT, el asistente empresarial de IA.
Tu misión es ayudar al usuario a personalizar su experiencia con preguntas conversacionales, de a una por turno.

Seguí este orden de preguntas:
1. Nombre del negocio o empresa
2. Nombre que quiere darle al asistente (sugerí "KITT" si no tiene idea)
3. Tono deseado: formal/profesional o amigable/cercano
4. Qué quiere lograr con la IA (gestionar emails, WhatsApp, generar reportes, todo lo anterior, etc.)

Reglas estrictas:
- UNA sola pregunta por turno, nunca dos.
- Sé amigable, breve y directo.
- Tras obtener las 4 respuestas, hacé un resumen claro y pedí confirmación.
- Si el usuario confirma, usá INMEDIATAMENTE la tool finalize_onboarding con todos los datos recolectados.
- Después de ejecutar la tool, felicitá al usuario brevemente y decile que ya puede conectar WhatsApp y Gmail.
- Respondé SIEMPRE en español argentino.
- Empezá saludando y preguntando el nombre del negocio.`

// =============================================================
// Tool de finalización
// =============================================================

const FINALIZE_TOOL: Anthropic.Tool = {
  name: "finalize_onboarding",
  description:
    "Finaliza el onboarding guardando la configuración personalizada del tenant. Llamar cuando el usuario confirme todos los datos recolectados.",
  input_schema: {
    type: "object" as const,
    properties: {
      businessName: {
        type: "string",
        description: "Nombre del negocio o empresa del usuario",
      },
      assistantName: {
        type: "string",
        description: "Nombre que el usuario quiere darle al asistente",
      },
      tone: {
        type: "string",
        enum: ["professional", "friendly"],
        description: "Tono deseado: professional (formal/conciso) o friendly (amigable/cercano)",
      },
      objectives: {
        type: "array",
        items: { type: "string" },
        description: "Lista de objetivos del usuario con la IA",
      },
    },
    required: ["businessName", "assistantName", "tone", "objectives"],
  },
}

interface FinalizeInput {
  businessName: string
  assistantName: string
  tone: "professional" | "friendly"
  objectives: string[]
}

// =============================================================
// Endpoint SSE
// =============================================================

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { messages } = (await req.json()) as {
      messages: { role: "user" | "assistant"; content: string }[]
    }

    // API key: primero tenant config (encriptado), después global, después env
    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })
    const tenantConfig = (tenant?.config ?? {}) as Record<string, string>

    let apiKey = process.env.ANTHROPIC_API_KEY ?? ""
    if (tenantConfig.anthropicApiKey) {
      try { apiKey = decrypt(tenantConfig.anthropicApiKey) } catch { /* usar fallback */ }
    } else {
      const cfgKey = await getConfig("anthropicApiKey")
      if (cfgKey) {
        try { apiKey = decrypt(cfgKey) } catch { apiKey = cfgKey }
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key de Anthropic no configurada. Configurala en Ajustes → Perfil." },
        { status: 422 }
      )
    }

    const client = new Anthropic({ apiKey })

    // Si no hay historial, usar mensaje inicial para que Claude salude
    const initialMessages: Anthropic.MessageParam[] =
      messages.length > 0
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: "user", content: "Iniciá la configuración." }]

    const tenantId = session.user.tenantId
    const userId = session.user.id
    const encoder = new TextEncoder()
    const send = (data: object) =>
      encoder.encode(`data: ${JSON.stringify(data)}\n\n`)

    let currentMessages: Anthropic.MessageParam[] = initialMessages
    const MAX_ITER = 8
    let iter = 0

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (iter < MAX_ITER) {
            iter++

            const msgStream = client.messages.stream({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: ONBOARDING_SYSTEM,
              tools: [FINALIZE_TOOL],
              messages: currentMessages,
            })

            msgStream.on("text", (text) => {
              controller.enqueue(send({ type: "text", text }))
            })

            const response = await msgStream.finalMessage()

            if (response.stop_reason === "end_turn") {
              break
            }

            if (response.stop_reason === "tool_use") {
              currentMessages.push({ role: "assistant", content: response.content })

              const toolResults: Anthropic.ToolResultBlockParam[] = []

              for (const block of response.content) {
                if (block.type !== "tool_use") continue

                if (block.name === "finalize_onboarding") {
                  const input = block.input as FinalizeInput

                  // Guardar config en tenant + marcar onboardingDone
                  const current = await db.tenant.findUnique({
                    where: { id: tenantId },
                    select: { config: true },
                  })
                  const currentCfg = (current?.config ?? {}) as Record<string, unknown>

                  await Promise.all([
                    db.tenant.update({
                      where: { id: tenantId },
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      data: {
                        config: {
                          ...currentCfg,
                          businessName: input.businessName,
                          assistantName: input.assistantName,
                          tone: input.tone,
                          objectives: input.objectives,
                        } as any,
                      },
                    }),
                    db.user.update({
                      where: { id: userId },
                      data: { onboardingDone: true },
                    }),
                  ])

                  controller.enqueue(send({ type: "finalized" }))

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: "Configuración guardada exitosamente.",
                  })
                }
              }

              currentMessages.push({ role: "user", content: toolResults })
              continue
            }

            break
          }

          controller.enqueue(send({ type: "turn_end" }))
          controller.close()
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido"
          console.error("[onboarding/chat] error:", err)
          controller.enqueue(send({ type: "error", message: msg }))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("[onboarding/chat] outer error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
