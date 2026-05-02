import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chat } from "@/lib/claude"
import { buildReportContext } from "@/lib/reportContext"

interface ReportSchedule {
  id: string
  name: string
  schedule: string
  days: string[]
  type: string
  content: string
  deliveryMethod: "email" | "whatsapp" | "both"
  emailSubject?: string
  enabled: boolean
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

function shouldRunNow(schedule: ReportSchedule, now: Date): boolean {
  if (!schedule.enabled) return false
  const dayKey = DAY_KEYS[now.getDay()]
  if (!schedule.days.includes(dayKey)) return false
  const [hh, mm] = schedule.schedule.split(":").map(Number)
  const diffMin = Math.abs(now.getHours() * 60 + now.getMinutes() - (hh * 60 + mm))
  return diffMin <= 2
}

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`
}

// POST /api/cron/reports — llamado por scheduler externo (Easypanel/cron-job.org)
// Genera reportes automáticos para cada tenant según sus schedules configurados.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results: { tenantId: string; scheduleId: string; reportId: string }[] = []
  const errors: { tenantId: string; scheduleId: string; error: string }[] = []

  let tenants: { id: string; config: unknown }[] = []
  try {
    tenants = await db.tenant.findMany({ select: { id: true, config: true } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  for (const tenant of tenants) {
    const config = (tenant.config ?? {}) as Record<string, unknown>
    const schedules = (config.reportSchedules ?? []) as ReportSchedule[]
    if (schedules.length === 0) continue

    for (const schedule of schedules) {
      if (!shouldRunNow(schedule, now)) continue

      try {
        const { waContext, gmailContext } = await buildReportContext(tenant.id)
        const contextSection = [waContext, gmailContext].filter(Boolean).join("\n\n")

        const prompt = `Generá un reporte automático programado.
Tipo: ${schedule.type}
Nombre: ${schedule.name}
Instrucciones: ${schedule.content || "Resumen general de actividad de las últimas 24-48 horas"}
${contextSection ? `\nCONTEXTO:\n${contextSection}\n` : ""}
Usá create_artifact con type="html". El HTML debe ser visualmente rico:
- Incluí gráficos con Chart.js (https://cdn.jsdelivr.net/npm/chart.js) para actividad si hay datos
- Secciones claras: resumen ejecutivo, actividad por canal, mensajes destacados, pendientes
- Estilo profesional con fondo oscuro (#0e0f11), tipografía clara`

        const result = await chat([{ role: "user", content: prompt }], tenant.id, null)
        const reportContent = result.artifact?.content ?? result.message
        const saved = await db.report.create({
          data: { tenantId: tenant.id, type: schedule.type, content: reportContent },
        })

        results.push({ tenantId: tenant.id, scheduleId: schedule.id, reportId: saved.id })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push({ tenantId: tenant.id, scheduleId: schedule.id, error: msg })
        console.error(`[cron/reports] error for tenant ${tenant.id}:`, err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    generated: results.length,
    checkedTenants: tenants.length,
    timestamp: now.toISOString(),
    results,
    ...(errors.length > 0 ? { errors } : {}),
  })
}

// GET — health check para el scheduler
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() })
}
