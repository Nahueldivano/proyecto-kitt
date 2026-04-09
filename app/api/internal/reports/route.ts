import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyInternalKey } from "@/lib/internal-auth"

export async function POST(req: NextRequest) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { tenantId, type, content } = await req.json()

    if (!tenantId || !type || !content) {
      return NextResponse.json(
        { error: "tenantId, type y content son requeridos" },
        { status: 400 }
      )
    }

    const report = await db.report.create({
      data: { tenantId, type, content },
    })

    return NextResponse.json({ id: report.id, success: true }, { status: 201 })
  } catch (error) {
    console.error("[internal/reports] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
