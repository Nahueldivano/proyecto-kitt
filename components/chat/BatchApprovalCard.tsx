"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface BatchTask {
  id: string
  label: string
  type: string
  status: "pending" | "approved" | "error"
  error?: string
  payload?: Record<string, unknown>
}

interface BatchApprovalCardProps {
  batchId: string
  title: string
  tasks: BatchTask[]
}

function TaskStatusIcon({ status }: { status: BatchTask["status"] }) {
  if (status === "approved") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[hsl(var(--success))] flex-shrink-0">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (status === "error") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[hsl(var(--destructive))] flex-shrink-0">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    )
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[hsl(var(--text-3))] flex-shrink-0">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function getTypeIcon(type: string) {
  if (type.includes("email")) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 14 19.79 19.79 0 0 1 1.07 5.34C1.02 3.84 2.02 2.52 3.42 2H6a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z" />
    </svg>
  )
}

export function BatchApprovalCard({ batchId: _batchId, title, tasks: initialTasks }: BatchApprovalCardProps) {
  const [tasks, setTasks] = useState<BatchTask[]>(initialTasks)
  const [globalStatus, setGlobalStatus] = useState<"pending" | "loading" | "done" | "rejected">("pending")

  const allIds = tasks.map((t) => t.id)

  async function handleApproveAll() {
    setGlobalStatus("loading")
    setTasks((prev) => prev.map((t) => ({ ...t, status: "pending" as const })))

    try {
      const res = await fetch("/api/actions/batch/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: allIds }),
      })
      const data = await res.json() as { results: { id: string; status: "approved" | "error"; error?: string }[] }

      setTasks((prev) =>
        prev.map((t) => {
          const r = data.results.find((x) => x.id === t.id)
          if (!r) return t
          return { ...t, status: r.status, error: r.error }
        })
      )
      setGlobalStatus("done")
    } catch {
      setGlobalStatus("pending")
    }
  }

  async function handleRejectAll() {
    setGlobalStatus("rejected")
    // Mark all as rejected locally — no server call needed for rejection
    setTasks((prev) => prev.map((t) => ({ ...t, status: "error" as const, error: "Rechazado" })))
  }

  const approved = tasks.filter((t) => t.status === "approved").length
  const errors = tasks.filter((t) => t.status === "error").length

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[hsl(var(--warning))] flex-shrink-0">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <span className="text-xs font-medium text-[hsl(var(--text-2))] truncate">{title}</span>
        <span className="ml-auto text-[10px] text-[hsl(var(--text-3))] flex-shrink-0">{tasks.length} tareas</span>
      </div>

      {/* Task list */}
      <div className="px-3 py-2 space-y-2">
        {tasks.map((task) => {
          // Extraer preview del mensaje del payload
          const preview = task.payload
            ? (task.payload.message ?? task.payload.body ?? task.payload.subject) as string | undefined
            : undefined

          return (
            <div key={task.id} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <TaskStatusIcon status={task.status} />
                <span className="text-[hsl(var(--text-3))]">{getTypeIcon(task.type)}</span>
                <span className="text-xs font-medium text-[hsl(var(--text-2))] flex-1 truncate">{task.label}</span>
                {task.error && task.error !== "Rechazado" && (
                  <span className="text-[10px] text-[hsl(var(--destructive))] truncate max-w-[120px]">{task.error}</span>
                )}
              </div>
              {/* Preview del texto del mensaje */}
              {preview && task.status !== "error" && (
                <p className="text-[11px] text-[hsl(var(--text-3))] pl-[38px] leading-snug line-clamp-2 italic">
                  "{String(preview).length > 120 ? String(preview).slice(0, 120) + "…" : preview}"
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions / summary */}
      {globalStatus === "pending" && (
        <div className="flex gap-2 px-3 pb-3">
          <Button variant="default" size="sm" className="flex-1" onClick={handleApproveAll}>
            Aprobar todo y enviar
          </Button>
          <Button variant="outline" size="sm" onClick={handleRejectAll}>
            Rechazar todo
          </Button>
        </div>
      )}

      {globalStatus === "loading" && (
        <div className="px-3 pb-3">
          <Button variant="outline" size="sm" className="w-full" loading>
            Enviando…
          </Button>
        </div>
      )}

      {globalStatus === "done" && (
        <div className="px-3 pb-3 flex items-center gap-2 text-xs text-[hsl(var(--text-2))]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[hsl(var(--success))]">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {approved} enviado{approved !== 1 ? "s" : ""}{errors > 0 ? `, ${errors} error${errors !== 1 ? "es" : ""}` : ""}
        </div>
      )}

      {globalStatus === "rejected" && (
        <div className="px-3 pb-3 flex items-center gap-2 text-[hsl(var(--text-3))] text-xs">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Lote rechazado
        </div>
      )}
    </div>
  )
}
