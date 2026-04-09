"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface ApprovalCardProps {
  actionId: string
  type: string
  payload: Record<string, unknown>
  onApproved?: () => void
  onRejected?: () => void
}

function getActionLabel(type: string): string {
  switch (type) {
    case "send_email":
      return "Enviar email"
    case "reply_email":
      return "Responder email"
    case "send_whatsapp_message":
      return "Enviar WhatsApp"
    default:
      return "Ejecutar acción"
  }
}

function getActionIcon(type: string) {
  if (type.includes("email")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 14 19.79 19.79 0 0 1 1.07 5.34C1.02 3.84 2.02 2.52 3.42 2H6a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z" />
    </svg>
  )
}

export function ApprovalCard({
  actionId,
  type,
  payload,
  onApproved,
  onRejected,
}: ApprovalCardProps) {
  const [status, setStatus] = useState<"pending" | "loading-approve" | "loading-reject" | "approved" | "rejected">("pending")

  async function handleApprove() {
    setStatus("loading-approve")
    try {
      const res = await fetch(`/api/actions/${actionId}/approve`, { method: "POST" })
      if (res.ok) {
        setStatus("approved")
        onApproved?.()
      } else {
        setStatus("pending")
      }
    } catch {
      setStatus("pending")
    }
  }

  async function handleReject() {
    setStatus("loading-reject")
    try {
      const res = await fetch(`/api/actions/${actionId}/reject`, { method: "POST" })
      if (res.ok) {
        setStatus("rejected")
        onRejected?.()
      } else {
        setStatus("pending")
      }
    } catch {
      setStatus("pending")
    }
  }

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
        <span className="text-[hsl(var(--warning))]">{getActionIcon(type)}</span>
        <span className="text-xs font-medium text-[hsl(var(--text-2))]">
          Acción pendiente de aprobación
        </span>
      </div>

      {/* Preview */}
      <div className="px-3 py-2.5 space-y-1">
        <p className="text-sm font-medium text-[hsl(var(--text))]">
          {getActionLabel(type)}
        </p>
        {payload.to !== undefined && (
          <p className="text-xs text-[hsl(var(--text-3))]">
            Para: {String(payload.to)}
          </p>
        )}
        {payload.subject !== undefined && (
          <p className="text-xs text-[hsl(var(--text-3))]">
            Asunto: {String(payload.subject)}
          </p>
        )}
        {payload.message !== undefined && (
          <p className="text-xs text-[hsl(var(--text-3))] line-clamp-3">
            {String(payload.message)}
          </p>
        )}
        {payload.body !== undefined && (
          <p className="text-xs text-[hsl(var(--text-3))] line-clamp-3">
            {String(payload.body)}
          </p>
        )}
      </div>

      {/* Actions */}
      {status === "pending" && (
        <div className="flex gap-2 px-3 pb-3">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={handleApprove}
          >
            Aprobar y enviar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReject}
          >
            Rechazar
          </Button>
        </div>
      )}

      {(status === "loading-approve" || status === "loading-reject") && (
        <div className="px-3 pb-3">
          <Button variant="outline" size="sm" className="w-full" loading>
            Procesando...
          </Button>
        </div>
      )}

      {status === "approved" && (
        <div className="px-3 pb-3 flex items-center gap-2 text-[hsl(var(--success))] text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Enviado exitosamente
        </div>
      )}

      {status === "rejected" && (
        <div className="px-3 pb-3 flex items-center gap-2 text-[hsl(var(--text-3))] text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Acción rechazada
        </div>
      )}
    </div>
  )
}
