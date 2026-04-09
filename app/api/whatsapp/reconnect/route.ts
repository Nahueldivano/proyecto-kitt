import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reconnect, getInstanceName } from "@/lib/evolution"

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantId = session.user.tenantId
    await reconnect(tenantId)

    await db.whatsappSession.upsert({
      where: { tenantId },
      update: { status: "connecting" },
      create: {
        tenantId,
        status: "connecting",
        instanceName: getInstanceName(tenantId),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[whatsapp/reconnect] error:", error)
    return NextResponse.json({ error: "Error al reconectar" }, { status: 500 })
  }
}
