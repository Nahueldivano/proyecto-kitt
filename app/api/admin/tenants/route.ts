import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getConfig } from "@/lib/config"

async function isAdmin(email: string): Promise<boolean> {
  const adminEmail = await getConfig("kittAdminEmail")
  return !!adminEmail && email === adminEmail
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!await isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const tenants = await db.tenant.findMany({
      include: {
        users: { select: { id: true, email: true, onboardingDone: true } },
        whatsappSession: { select: { status: true, connectedAt: true } },
        gmailConnection: { select: { email: true, connectedAt: true } },
        _count: {
          select: {
            conversations: true,
            reports: true,
            pendingActions: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ tenants })
  } catch (error) {
    console.error("[admin/tenants] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// PATCH — marcar onboardingDone u otras props de usuario
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!await isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { userId, onboardingDone } = await req.json()
    if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 })

    const updated = await db.user.update({
      where: { id: userId },
      data: { ...(onboardingDone !== undefined ? { onboardingDone: Boolean(onboardingDone) } : {}) },
      select: { id: true, email: true, onboardingDone: true },
    })
    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error("[admin/tenants] PATCH error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
