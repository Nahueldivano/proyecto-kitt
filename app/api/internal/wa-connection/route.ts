import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyInternalKey } from "@/lib/internal-auth"

export async function GET(req: NextRequest) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get("tenantId")

    const where = tenantId ? { tenantId } : {}
    const sessions = await db.whatsappSession.findMany({ where })

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("[internal/wa-connection] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { tenantId, status } = await req.json()

    if (!tenantId || !status) {
      return NextResponse.json({ error: "tenantId y status requeridos" }, { status: 400 })
    }

    await db.whatsappSession.upsert({
      where: { tenantId },
      update: {
        status,
        ...(status === "connected" ? { connectedAt: new Date() } : {}),
      },
      create: {
        tenantId,
        status,
        instanceName: `kitt_${tenantId}`,
        ...(status === "connected" ? { connectedAt: new Date() } : {}),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[internal/wa-connection] POST error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
