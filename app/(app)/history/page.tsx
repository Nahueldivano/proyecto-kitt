"use client"

import { useEffect, useState } from "react"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface Report {
  id: string
  type: string
  content: string
  generatedAt: string
}

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  morning: { label: "Matutino", emoji: "☀️" },
  midday: { label: "Intermedio", emoji: "🌤️" },
  evening: { label: "Nocturno", emoji: "🌙" },
}

export default function HistoryPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Report | null>(null)

  useEffect(() => {
    fetch("/api/reports?limit=50")
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full flex overflow-hidden">
      {/* Lista */}
      <div className={`w-full md:w-80 border-r border-[hsl(var(--border))] flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="px-4 py-4 border-b border-[hsl(var(--border))]">
          <h1 className="text-base font-semibold text-[hsl(var(--text))]">Historial</h1>
          <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">
            Reportes automáticos generados por KITT
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-[hsl(var(--text-3))]">
              Cargando...
            </div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-[hsl(var(--text-3))]">
                No hay reportes aún
              </p>
              <p className="text-xs text-[hsl(var(--text-3))]">
                Los reportes se generan automáticamente 3 veces al día
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {reports.map((report) => {
                const typeInfo = TYPE_LABELS[report.type] ?? { label: report.type, emoji: "📄" }
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelected(report)}
                    className={`w-full px-4 py-3 text-left hover:bg-[hsl(var(--surface-2))] transition-colors ${
                      selected?.id === report.id ? "bg-[hsl(var(--surface-2))]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{typeInfo.emoji}</span>
                      <span className="text-sm font-medium text-[hsl(var(--text))]">
                        {typeInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-[hsl(var(--text-3))]">
                      {formatDate(report.generatedAt)}
                    </p>
                    <p className="text-xs text-[hsl(var(--text-2))] mt-1 line-clamp-2">
                      {report.content.substring(0, 100)}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center gap-3">
            <button
              onClick={() => setSelected(null)}
              className="md:hidden text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]"
            >
              ←
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span>{TYPE_LABELS[selected.type]?.emoji}</span>
                <span className="text-sm font-medium text-[hsl(var(--text))]">
                  Reporte {TYPE_LABELS[selected.type]?.label ?? selected.type}
                </span>
              </div>
              <p className="text-xs text-[hsl(var(--text-3))]">
                {formatDate(selected.generatedAt)}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <pre className="whitespace-pre-wrap text-sm text-[hsl(var(--text))] font-sans leading-relaxed">
              {selected.content}
            </pre>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-[hsl(var(--text-3))]">
          Seleccioná un reporte para verlo
        </div>
      )}
    </div>
  )
}
