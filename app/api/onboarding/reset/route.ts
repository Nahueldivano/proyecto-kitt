import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Reset onboardingDone flag on User
    await db.user.update({
      where: { id: session.user.id },
      data: { onboardingDone: false },
    })

    // Clear onboarding-related config from Tenant
    const tenant = await db.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { config: true },
    })
    // tenant.config es un objeto JS (Prisma deserializa Json automáticamente)
    const config = { ...((tenant?.config ?? {}) as Record<string, unknown>) }
    delete config.userContext
    delete config.assistantName
    delete config.tone
    delete config.businessName
    delete config.objectives

    await db.tenant.update({
      where: { id: session.user.tenantId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { config: config as any },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[onboarding/reset] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
