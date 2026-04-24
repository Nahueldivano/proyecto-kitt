import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getMemory, clearMemory, MAX_FACTS } from "@/lib/memory"
import { db } from "@/lib/db"
import type { TrackedEntity } from "@/lib/memory"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [memory, tenant] = await Promise.all([
    getMemory(session.user.tenantId),
    db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    }),
  ])

  const config = (tenant?.config ?? {}) as Record<string, unknown>
  const trackedEntities = (config.trackedEntities ?? []) as TrackedEntity[]

  return NextResponse.json({
    usagePercent: Math.min(100, Math.round((memory.facts.length / MAX_FACTS) * 100)),
    factsCount: memory.facts.length,
    maxFacts: MAX_FACTS,
    facts: memory.facts,
    trackedEntities,
    updatedAt: memory.updatedAt,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await clearMemory(session.user.tenantId)
  return NextResponse.json({ success: true })
}
