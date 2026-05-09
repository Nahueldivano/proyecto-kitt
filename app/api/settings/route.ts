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
    const [tenant, gmailConn] = await Promise.all([
      db.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { config: true },
      }),
      db.gmailConnection.findUnique({
        where: { tenantId: session.user.tenantId },
        select: { email: true },
      }),
    ])

    const cfg = (tenant?.config ?? {}) as Record<string, unknown>
    // No enviar keys encriptadas al cliente — solo flags de presencia
    const { anthropicApiKey, openaiApiKey, ...safeConfig } = cfg
    return NextResponse.json({
      config: safeConfig,
      hasAnthropicKey: !!anthropicApiKey,
      hasOpenaiKey: !!openaiApiKey,
      gmailEmail: gmailConn?.email ?? null,
    })
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
      "country",
      "model",
      "reportSchedules",
      "notifyViaWhatsapp",
      "notifyViaEmail",
      "anthropicApiKey",
      "openaiApiKey",
      "trackedEntities",
      "waMonitorPrompt",
      "gmailMonitorPrompt",
      "waHistoryDays",
      "waContactWhitelist",
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

    // Encriptar API keys antes de guardar
    if (updates.anthropicApiKey && typeof updates.anthropicApiKey === "string") {
      updates.anthropicApiKey = encrypt(updates.anthropicApiKey)
    }
    if (updates.openaiApiKey && typeof updates.openaiApiKey === "string") {
      updates.openaiApiKey = encrypt(updates.openaiApiKey)
    }

    const newConfig = { ...currentConfig, ...updates }

    await db.tenant.update({
      where: { id: session.user.tenantId },
      data: { config: newConfig as Record<string, string | number | boolean | null> },
    })

    const { anthropicApiKey: _ak, openaiApiKey: _ok, ...safeNewConfig } = newConfig
    return NextResponse.json({
      success: true,
      config: safeNewConfig,
      hasAnthropicKey: !!newConfig.anthropicApiKey,
      hasOpenaiKey: !!newConfig.openaiApiKey,
    })
  } catch (error) {
    console.error("[settings] POST error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
