import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chat } from "@/lib/claude"
import { buildReportContext } from "@/lib/reportContext"

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

    const tenantId = session.user.tenantId
    const { waContext, gmailContext } = await buildReportContext(tenantId)
    const contextSection = [waContext, gmailContext].filter(Boolean).join("\n\n")

    const prompt = `Generá un reporte detallado para el usuario.
Tipo: ${type}
Título: ${title}
Instrucciones: ${instructions}
${contextSection ? `\nCONTEXTO DISPONIBLE:\n${contextSection}\n` : ""}
Usá la tool create_artifact con type="html" para generar el reporte.
El HTML debe ser profesional y visualmente rico:
- Usá Chart.js desde https://cdn.jsdelivr.net/npm/chart.js para gráficos de actividad si hay datos suficientes (mensajes por día, por chat, etc.)
- Organizá el contenido en secciones claras con headings
- Incluí resúmenes, métricas clave y destacados relevantes del contexto
- Estilo limpio con colores suaves, tipografía legible, fondo oscuro (#0e0f11) o claro según corresponda
El reporte debe responder las instrucciones del usuario usando los datos del contexto provisto.`

    const result = await chat(
      [{ role: "user", content: prompt }],
      tenantId,
      null
    )

    const reportContent = result.artifact?.content ?? result.message
    const saved = await db.report.create({
      data: {
        tenantId,
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
