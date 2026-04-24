import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/crypto"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })

    return NextResponse.json({ config: tenant?.config ?? {} })
  } catch (error) {
    console.error("[settings] GET error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()

    // Solo permitir campos conocidos en config
    const allowedFields = [
      "assistantName",
      "tone",
      "model",
      "reportSchedule",
      "notifyViaWhatsapp",
      "notifyViaEmail",
      "anthropicApiKey",
      "trackedEntities",
    ]

    const current = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })

    const currentConfig = (current?.config ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    // Encriptar API key de Anthropic antes de guardar
    if (updates.anthropicApiKey && typeof updates.anthropicApiKey === "string") {
      updates.anthropicApiKey = encrypt(updates.anthropicApiKey)
    }

    const newConfig = { ...currentConfig, ...updates }

    await db.tenant.update({
      where: { id: session.user.tenantId },
      data: { config: newConfig as Record<string, string | number | boolean | null> },
    })

    return NextResponse.json({ success: true, config: newConfig })
  } catch (error) {
    console.error("[settings] POST error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
