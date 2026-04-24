"use client"

import { useEffect, useState } from "react"
import { formatDate } from "@/lib/utils"
import { ReportListSkeleton, ReportDetailSkeleton } from "@/components/ui/Skeleton"

// ── Types ──────────────────────────────────────────────────────

interface Report {
  id: string
  type: string
  content: string
  generatedAt: string
}

interface Artifact {
  type: "document" | "html" | "chart" | "code"
  title: string
  content: string
  language?: string
}

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

// ── Constants ──────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  morning: { label: "Matutino", emoji: "☀️" },
  midday: { label: "Intermedio", emoji: "🌤️" },
  evening: { label: "Nocturno", emoji: "🌙" },
  custom: { label: "Personalizado", emoji: "📊" },
}

const DAYS_MAP = [
  { key: "mon", label: "L" },
  { key: "tue", label: "M" },
  { key: "wed", label: "X" },
  { key: "thu", label: "J" },
  { key: "fri", label: "V" },
  { key: "sat", label: "S" },
  { key: "sun", label: "D" },
]

// ── Simple markdown renderer for inline display ────────────────

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
}

function buildIframeSrc(content: string, type: string): string {
  if (type === "html" || type === "chart") return content
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;padding:20px 24px;line-height:1.7;color:#ededed;background:#0e0f11;margin:0}
    h1,h2,h3{color:#fff;margin-top:1.3em;margin-bottom:.3em}h1{font-size:1.35em}h2{font-size:1.15em}h3{font-size:1em}
    p{margin:.5em 0}ul{padding-left:1.3em}li{margin:.2em 0}strong{font-weight:600}
  </style></head><body><p>${simpleMarkdownToHtml(content)}</p></body></html>`
}

// ── Shared UI helpers ──────────────────────────────────────────

function inputClass() {
  return "w-full px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none focus:shadow-[0_0_0_1.5px_hsl(var(--accent))] transition-shadow"
}

function labelClass() {
  return "block text-xs font-medium text-[hsl(var(--text-2))] mb-1.5"
}

// ── Tab: Historial ─────────────────────────────────────────────

function TabHistorial() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Report | null>(null)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    fetch("/api/reports?limit=50")
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all" ? reports : reports.filter((r) => r.type === filter)

  return (
    <div className="h-full flex overflow-hidden">
      {/* Lista */}
      <div className={`w-full md:w-72 border-r border-[hsl(var(--border))] flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] text-xs text-[hsl(var(--text-2))] outline-none"
          >
            <option value="all">Todos los tipos</option>
            <option value="morning">Matutinos</option>
            <option value="midday">Intermedios</option>
            <option value="evening">Nocturnos</option>
            <option value="custom">Personalizados</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <ReportListSkeleton />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm text-[hsl(var(--text-3))]">No hay reportes aún</p>
              <p className="text-xs text-[hsl(var(--text-3))]">Los reportes automáticos se generan 3 veces al día</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {filtered.map((report) => {
                const info = TYPE_LABELS[report.type] ?? { label: report.type, emoji: "📄" }
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelected(report)}
                    className={`w-full px-4 py-3 text-left hover:bg-[hsl(var(--surface-2))] transition-colors ${selected?.id === report.id ? "bg-[hsl(var(--surface-2))]" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span>{info.emoji}</span>
                      <span className="text-sm font-medium text-[hsl(var(--text))]">{info.label}</span>
                    </div>
                    <p className="text-xs text-[hsl(var(--text-3))]">{formatDate(report.generatedAt)}</p>
                    <p className="text-xs text-[hsl(var(--text-2))] mt-1 line-clamp-2">{report.content.substring(0, 100)}</p>
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
            <button onClick={() => setSelected(null)} className="md:hidden text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]">←</button>
            <div>
              <div className="flex items-center gap-2">
                <span>{TYPE_LABELS[selected.type]?.emoji ?? "📄"}</span>
                <span className="text-sm font-medium text-[hsl(var(--text))]">
                  Reporte {TYPE_LABELS[selected.type]?.label ?? selected.type}
                </span>
              </div>
              <p className="text-xs text-[hsl(var(--text-3))]">{formatDate(selected.generatedAt)}</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              srcDoc={buildIframeSrc(selected.content, selected.type)}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="Reporte"
            />
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

// ── Tab: Crear Reporte ─────────────────────────────────────────

function TabCrear() {
  const [title, setTitle] = useState("")
  const [type, setType] = useState("custom")
  const [instructions, setInstructions] = useState("")
  const [generating, setGenerating] = useState(false)
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [error, setError] = useState("")

  async function handleGenerate() {
    if (!instructions.trim()) {
      setError("Escribí qué debe incluir el reporte")
      return
    }
    setError("")
    setGenerating(true)
    setArtifact(null)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: title || "Reporte", instructions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setArtifact(data.artifact)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando el reporte")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[hsl(var(--text))]">Crear reporte personalizado</h2>
          <p className="text-sm text-[hsl(var(--text-3))] mt-1">KITT generará el reporte usando IA y lo guardará en el historial.</p>
        </div>

        <div>
          <label className={labelClass()}>Título</label>
          <input type="text" className={inputClass()} placeholder="Ej: Resumen semanal de comunicaciones" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label className={labelClass()}>Tipo de reporte</label>
          <select className={inputClass()} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="custom">Personalizado</option>
            <option value="morning">Matutino</option>
            <option value="midday">Intermedio</option>
            <option value="evening">Nocturno</option>
          </select>
        </div>

        <div>
          <label className={labelClass()}>¿Qué debe incluir el reporte?</label>
          <textarea
            className={`${inputClass()} resize-none`}
            rows={4}
            placeholder="Ej: Resumen de emails recibidos esta semana, estado de conversaciones de WhatsApp, temas pendientes sin resolver..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.08)] px-3 py-2 rounded-lg">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:bg-[hsl(var(--accent-hover))] transition-colors disabled:opacity-60"
        >
          {generating && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          {generating ? "Generando reporte..." : "Generar reporte"}
        </button>

        {artifact && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
              <p className="text-sm font-medium text-[hsl(var(--text))]">{artifact.title}</p>
              <span className="text-xs text-[hsl(var(--text-3))]">— Reporte generado</span>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] overflow-hidden" style={{ height: "420px" }}>
              <iframe
                srcDoc={buildIframeSrc(artifact.content, artifact.type)}
                className="w-full h-full border-0"
                sandbox="allow-scripts"
                title={artifact.title}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Programar ─────────────────────────────────────────────

const EMPTY_SCHEDULE: Omit<ReportSchedule, "id"> = {
  name: "",
  schedule: "08:00",
  days: ["mon", "tue", "wed", "thu", "fri"],
  type: "morning",
  content: "",
  deliveryMethod: "email",
  emailSubject: "KITT — Reporte automático",
  enabled: true,
}

function TabProgramar() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Omit<ReportSchedule, "id">>(EMPTY_SCHEDULE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSchedules(d.config?.reportSchedules ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function saveSchedules(newSchedules: ReportSchedule[]) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportSchedules: newSchedules }),
    })
    setSchedules(newSchedules)
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    const newSchedule: ReportSchedule = { ...form, id: crypto.randomUUID() }
    await saveSchedules([...schedules, newSchedule])
    setForm(EMPTY_SCHEDULE)
    setShowForm(false)
    setSaving(false)
  }

  async function handleToggle(id: string) {
    const updated = schedules.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
    await saveSchedules(updated)
  }

  async function handleDelete(id: string) {
    await saveSchedules(schedules.filter((s) => s.id !== id))
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }))
  }

  if (loading) {
    return <ReportDetailSkeleton />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Reportes programados</h2>
            <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">Se envían automáticamente por WhatsApp o email</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:bg-[hsl(var(--accent-hover))] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nueva
          </button>
        </div>

        {/* Formulario nuevo */}
        {showForm && (
          <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] space-y-4">
            <p className="text-sm font-medium text-[hsl(var(--text))]">Nueva programación</p>

            <div>
              <label className={labelClass()}>Nombre</label>
              <input type="text" className={inputClass()} placeholder="Ej: Reporte matutino" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass()}>Hora</label>
                <input type="time" className={inputClass()} value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass()}>Tipo</label>
                <select className={inputClass()} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="morning">Matutino</option>
                  <option value="midday">Intermedio</option>
                  <option value="evening">Nocturno</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass()}>Días</label>
              <div className="flex gap-1.5">
                {DAYS_MAP.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    className={`h-8 w-8 rounded-lg text-xs font-medium transition-all ${form.days.includes(d.key) ? "bg-[hsl(var(--accent))] text-white" : "border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass()}>Contenido del reporte</label>
              <textarea className={`${inputClass()} resize-none`} rows={2} placeholder="Qué debe incluir el reporte..." value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </div>

            <div>
              <label className={labelClass()}>Método de entrega</label>
              <div className="flex gap-2">
                {(["email", "whatsapp", "both"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm((f) => ({ ...f, deliveryMethod: m }))}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${form.deliveryMethod === m ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]" : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))]"}`}
                  >
                    {m === "email" ? "Email" : m === "whatsapp" ? "WhatsApp" : "Ambos"}
                  </button>
                ))}
              </div>
            </div>

            {(form.deliveryMethod === "email" || form.deliveryMethod === "both") && (
              <div>
                <label className={labelClass()}>Asunto del email</label>
                <input type="text" className={inputClass()} placeholder="KITT — Reporte automático" value={form.emailSubject ?? ""} onChange={(e) => setForm((f) => ({ ...f, emailSubject: e.target.value }))} />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(var(--accent))] text-white text-sm font-medium hover:bg-[hsl(var(--accent-hover))] transition-colors disabled:opacity-60"
              >
                {saving && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
                Guardar
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-[hsl(var(--border-2))] text-sm text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de schedules */}
        {schedules.length === 0 && !showForm ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[hsl(var(--text-3))]">No hay reportes programados</p>
            <p className="text-xs text-[hsl(var(--text-3))] mt-1">Hacé click en "Nueva" para crear uno</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => {
              const info = TYPE_LABELS[s.type] ?? { emoji: "📊", label: s.type }
              return (
                <div key={s.id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{info.emoji}</span>
                        <p className="text-sm font-medium text-[hsl(var(--text))]">{s.name}</p>
                      </div>
                      <p className="text-xs text-[hsl(var(--text-3))]">
                        {s.schedule} · {s.days.map((d) => DAYS_MAP.find((x) => x.key === d)?.label).join(" ")} · {s.deliveryMethod === "both" ? "Email + WA" : s.deliveryMethod}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(s.id)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${s.enabled ? "bg-[hsl(var(--accent))]" : "bg-[hsl(var(--border-2))]"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-1.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.08)] rounded-lg transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

type Tab = "historial" | "crear" | "programar"

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("historial")

  const tabs: { key: Tab; label: string }[] = [
    { key: "historial", label: "Historial" },
    { key: "crear", label: "Crear reporte" },
    { key: "programar", label: "Programar" },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tabs header */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-[hsl(var(--border))] flex-shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                : "border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "historial" && <TabHistorial />}
        {tab === "crear" && <TabCrear />}
        {tab === "programar" && <TabProgramar />}
      </div>
    </div>
  )
}
