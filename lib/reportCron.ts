// Lógica del cron de reportes — separada de instrumentation.ts para que
// webpack no intente bundlear googleapis (fs/http/net) en el edge runtime.

export function startReportCron() {
  const INTERVAL_MS = 60 * 60 * 1000 // cada hora

  async function runReports() {
    try {
      const { db } = await import("@/lib/db")
      const { chat } = await import("@/lib/claude")
      const { buildReportContext } = await import("@/lib/reportContext")

      const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
      const now = new Date()
      const dayKey = DAY_KEYS[now.getDay()]
      const nowMin = now.getHours() * 60 + now.getMinutes()

      const tenants = await db.tenant.findMany({ select: { id: true, config: true } })

      for (const tenant of tenants) {
        const config = (tenant.config ?? {}) as Record<string, unknown>
        const schedules = (config.reportSchedules ?? []) as Array<{
          id: string; name: string; schedule: string; days: string[]
          type: string; content: string; enabled: boolean
        }>

        for (const schedule of schedules) {
          if (!schedule.enabled) continue
          if (!schedule.days.includes(dayKey)) continue
          const [hh, mm] = schedule.schedule.split(":").map(Number)
          if (Math.abs(nowMin - (hh * 60 + mm)) > 30) continue

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
            await db.report.create({ data: { tenantId: tenant.id, type: schedule.type, content: reportContent } })
            console.log(`[cron] report generated: tenant=${tenant.id} schedule=${schedule.id}`)
          } catch (err) {
            console.error(`[cron] report error: tenant=${tenant.id} schedule=${schedule.id}`, err)
          }
        }
      }
    } catch (err) {
      console.error("[cron] runReports error:", err)
    }
  }

  setTimeout(() => {
    runReports()
    setInterval(runReports, INTERVAL_MS)
  }, 60_000)

  console.log("[instrumentation] report cron scheduled (hourly)")
}
