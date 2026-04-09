import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyInternalKey } from "@/lib/internal-auth"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyInternalKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    const tenant = await db.tenant.findUnique({
      where: { id },
      include: {
        whatsappSession: { select: { status: true, instanceName: true } },
        gmailConnection: { select: { email: true } },
      },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 })
    }

    // Últimos reportes para contexto
    const reports = await db.report.findMany({
      where: { tenantId: id },
      orderBy: { generatedAt: "desc" },
      take: 5,
      select: { type: true, content: true, generatedAt: true },
    })

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        config: tenant.config,
        whatsapp: tenant.whatsappSession,
        gmail: tenant.gmailConnection,
      },
      recentReports: reports,
    })
  } catch (error) {
    console.error("[internal/tenant/context] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
