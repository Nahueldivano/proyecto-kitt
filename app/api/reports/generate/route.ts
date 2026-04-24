import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chat } from "@/lib/claude"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { type = "custom", title = "Reporte", instructions = "" } = body

    if (!instructions.trim()) {
      return NextResponse.json({ error: "Las instrucciones son requeridas" }, { status: 400 })
    }

    const prompt = `Generá un reporte detallado para el usuario.
Tipo: ${type}
Título: ${title}
Instrucciones: ${instructions}

Usá la tool create_artifact para generar el contenido.
- Si es un resumen o reporte de texto: usá type="document" con formato Markdown completo (headings, listas, negrita).
- Si incluye gráficos o dashboards: usá type="html" con Chart.js desde CDN.
El artefacto debe ser rico, completo y profesional.`

    const result = await chat(
      [{ role: "user", content: prompt }],
      session.user.tenantId,
      null
    )

    // Guardar en la base de datos
    const reportContent = result.artifact?.content ?? result.message
    const saved = await db.report.create({
      data: {
        tenantId: session.user.tenantId,
        type,
        content: reportContent,
      },
    })

    return NextResponse.json({
      reportId: saved.id,
      artifact: result.artifact ?? {
        type: "document",
        title,
        content: result.message,
      },
    })
  } catch (error) {
    console.error("[reports/generate] error:", error)
    return NextResponse.json({ error: "Error generando el reporte" }, { status: 500 })
  }
}
