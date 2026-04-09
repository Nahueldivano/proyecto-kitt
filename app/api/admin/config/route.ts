import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { getAllConfig, invalidateCache } from "@/lib/config"
import { db } from "@/lib/db"

const OBFUSCATE_KEYS = [
  "anthropicApiKey",
  "evolutionKey",
  "googleClientSecret",
  "kittInternalKey",
]

function obfuscate(value: string): string {
  if (!value || value.length < 8) return "••••••••"
  return value.slice(0, 4) + "••••••••" + value.slice(-4)
}

async function requireAdmin(email: string): Promise<boolean> {
  const adminEmail = process.env.KITT_ADMIN_EMAIL
  return !!adminEmail && email === adminEmail
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!await requireAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const allConfig = await getAllConfig()

    // Obfuscar valores sensibles
    const safe = Object.fromEntries(
      Object.entries(allConfig).map(([key, entry]) => [
        key,
        {
          ...entry,
          display: OBFUSCATE_KEYS.includes(key)
            ? obfuscate(entry.value)
            : entry.value,
        },
      ])
    )

    return NextResponse.json({ config: safe })
  } catch (error) {
    console.error("[admin/config] GET error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!await requireAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const updates: Record<string, string> = await req.json()

    const validKeys = [
      "anthropicApiKey",
      "evolutionUrl",
      "evolutionKey",
      "googleClientId",
      "googleClientSecret",
      "kittInternalKey",
      "kittAdminEmail",
    ]

    const ops = []
    for (const [key, value] of Object.entries(updates)) {
      if (!validKeys.includes(key)) continue
      if (typeof value !== "string") continue

      ops.push(
        db.appConfig.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    }

    await Promise.all(ops)
    invalidateCache()

    return NextResponse.json({ success: true, updated: ops.length })
  } catch (error) {
    console.error("[admin/config] PUT error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
