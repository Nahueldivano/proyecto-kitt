import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // Guardar config inicial si viene en el body
    if (body.config && session.user.tenantId) {
      const current = await db.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { config: true },
      })
      const currentConfig = (current?.config ?? {}) as Record<string, unknown>
      await db.tenant.update({
        where: { id: session.user.tenantId },
        data: { config: { ...currentConfig, ...body.config } },
      })
    }

    // Marcar onboarding como completado
    await db.user.update({
      where: { id: session.user.id },
      data: { onboardingDone: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[onboarding/complete] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
