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
    const config = JSON.parse((tenant?.config as string) ?? "{}") as Record<string, unknown>
    delete config.userContext
    delete config.assistantName
    delete config.tone

    await db.tenant.update({
      where: { id: session.user.tenantId },
      data: { config: JSON.stringify(config) },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[onboarding/reset] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
