import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStatus } from "@/lib/evolution"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantId = session.user.tenantId
    const status = await getStatus(tenantId)

    // Sincronizar estado en DB
    const existing = await db.whatsappSession.findUnique({ where: { tenantId } })
    if (existing && existing.status !== status) {
      await db.whatsappSession.update({
        where: { tenantId },
        data: {
          status,
          ...(status === "connected" ? { connectedAt: new Date() } : {}),
        },
      })
    }

    return NextResponse.json({ status })
  } catch (error) {
    console.error("[whatsapp/status] error:", error)
    return NextResponse.json({ status: "disconnected" })
  }
}
