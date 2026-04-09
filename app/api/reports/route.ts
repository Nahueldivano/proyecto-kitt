import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50)
    const type = searchParams.get("type") // morning | midday | evening

    const reports = await db.report.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(type ? { type } : {}),
      },
      orderBy: { generatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        content: true,
        generatedAt: true,
      },
    })

    return NextResponse.json({ reports })
  } catch (error) {
    console.error("[reports] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
