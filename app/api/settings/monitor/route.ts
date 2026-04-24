import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { getConfig } from "@/lib/config"
import { decrypt } from "@/lib/crypto"
import type { TrackedEntity } from "@/lib/memory"

const UPDATE_TOOL: Anthropic.Tool = {
  name: "update_tracked_entities",
  description:
    "Guarda la lista estructurada de contactos, grupos y correos que KITT debe monitorear en segundo plano.",
  input_schema: {
    type: "object" as const,
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["whatsapp", "email"],
              description: "Tipo: whatsapp (grupo o contacto) o email",
            },
            identifier: {
              type: "string",
              description:
                "Identificador exacto: número de teléfono, nombre del grupo de WA, o dirección de email",
            },
            description: {
              type: "string",
              description: "Descripción humana, ej: 'Grupo Ventas', 'Cliente Juan'",
            },
          },
          required: ["type", "identifier", "description"],
        },
      },
    },
    required: ["entities"],
  },
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { text } = (await req.json()) as { text: unknown }
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Texto requerido" }, { status: 400 })
    }

    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })
    const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>

    // API key: tenant primero, después global
    const rawKey =
      (tenantConfig.anthropicApiKey as string | undefined) ||
      (await getConfig("anthropicApiKey"))
    if (!rawKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 422 })
    }
    const apiKey = decrypt(rawKey)

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `Analizá el texto del usuario e identificá qué contactos, grupos de WhatsApp o direcciones de email quiere monitorear.
Para cada entidad determiná si es whatsapp (grupo, contacto, número) o email (dirección).
Usá la tool update_tracked_entities para entregar los resultados estructurados.
No agregues entidades que el usuario no haya mencionado explícitamente.`,
      tools: [UPDATE_TOOL],
      messages: [{ role: "user", content: text }],
    })

    for (const block of response.content) {
      if (block.type !== "tool_use" || block.name !== "update_tracked_entities") continue

      const input = block.input as { entities: TrackedEntity[] }

      // Fusionar con las entidades ya existentes (sin duplicados por identifier)
      const existing = (tenantConfig.trackedEntities ?? []) as TrackedEntity[]
      const merged = [...existing]
      for (const entity of input.entities) {
        if (!merged.some((e) => e.identifier.toLowerCase() === entity.identifier.toLowerCase())) {
          merged.push(entity)
        }
      }

      await db.tenant.update({
        where: { id: session.user.tenantId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { config: { ...tenantConfig, trackedEntities: merged } as any },
      })

      return NextResponse.json({ success: true, added: input.entities.length, entities: merged })
    }

    return NextResponse.json(
      { error: "No pude identificar entidades para monitorear en el texto." },
      { status: 422 }
    )
  } catch (error) {
    console.error("[settings/monitor] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE /api/settings/monitor/:identifier — eliminar una entidad rastreada
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { identifier } = (await req.json()) as { identifier: string }

    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })
    const tenantConfig = (tenant?.config ?? {}) as Record<string, unknown>
    const existing = (tenantConfig.trackedEntities ?? []) as TrackedEntity[]
    const updated = existing.filter(
      (e) => e.identifier.toLowerCase() !== identifier.toLowerCase()
    )

    await db.tenant.update({
      where: { id: session.user.tenantId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { config: { ...tenantConfig, trackedEntities: updated } as any },
    })

    return NextResponse.json({ success: true, entities: updated })
  } catch (error) {
    console.error("[settings/monitor] DELETE error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
