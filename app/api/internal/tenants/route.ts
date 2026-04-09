import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyInternalKey } from "@/lib/internal-auth"

export async function GET(req: NextRequest) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenants = await db.tenant.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        whatsappSession: { select: { status: true } },
        gmailConnection: { select: { email: true } },
      },
    })

    return NextResponse.json({ tenants })
  } catch (error) {
    console.error("[internal/tenants] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
