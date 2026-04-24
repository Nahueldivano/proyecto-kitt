"use client"

import { useEffect, useState, KeyboardEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AVAILABLE_MODELS } from "@/lib/models"
import type { TrackedEntity } from "@/lib/memory"

interface TenantConfig {
  assistantName?: string
  tone?: string
  model?: string
}

interface MemoryStats {
  usagePercent: number
  factsCount: number
  maxFacts: number
  trackedEntities: TrackedEntity[]
  updatedAt: string
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const [config, setConfig] = useState<TenantConfig>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // WhatsApp state
  const [waStatus, setWaStatus] = useState<string>("disconnected")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  // Gmail state
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [disconnectingGmail, setDisconnectingGmail] = useState(false)

  // Memory state
  const [memory, setMemory] = useState<MemoryStats | null>(null)
  const [clearingMemory, setClearingMemory] = useState(false)

  // Monitor state
  const [monitorInput, setMonitorInput] = useState("")
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [monitorFeedback, setMonitorFeedback] = useState<string | null>(null)

  const gmailConnected = searchParams.get("gmail") === "connected"

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config ?? {})
        if (d.gmailEmail) setGmailEmail(d.gmailEmail)
      })
      .catch(() => {})

    fetch("/api/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setWaStatus(d.status))
      .catch(() => {})

    loadMemory()
  }, [])

  async function loadMemory() {
    try {
      const res = await fetch("/api/memory")
      if (res.ok) {
        const data = await res.json()
        setMemory(data)
      }
    } catch {}
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function fetchQR() {
    setQrLoading(true)
    try {
      const res = await fetch("/api/whatsapp/qr")
      if (res.ok) {
        const data = await res.json()
        setQrCode(data.qrcode)
        setWaStatus("connecting")
      }
    } finally {
      setQrLoading(false)
    }
  }

  async function handleReconnect() {
    setReconnecting(true)
    try {
      await fetch("/api/whatsapp/reconnect", { method: "POST" })
      await fetchQR()
    } finally {
      setReconnecting(false)
    }
  }

  async function handleGmailDisconnect() {
    setDisconnectingGmail(true)
    try {
      await fetch("/api/email/disconnect", { method: "POST" })
      setGmailEmail(null)
    } finally {
      setDisconnectingGmail(false)
    }
  }

  async function handleClearMemory() {
    if (!confirm("¿Borrar toda la memoria de KITT? Esta acción no se puede deshacer.")) return
    setClearingMemory(true)
    try {
      await fetch("/api/memory", { method: "DELETE" })
      await loadMemory()
    } finally {
      setClearingMemory(false)
    }
  }

  async function handleMonitorSubmit() {
    const text = monitorInput.trim()
    if (!text || monitorLoading) return

    setMonitorLoading(true)
    setMonitorFeedback(null)
    try {
      const res = await fetch("/api/settings/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (res.ok) {
        setMonitorInput("")
        setMonitorFeedback(`✓ ${data.added} entidad${data.added !== 1 ? "es" : ""} agregada${data.added !== 1 ? "s" : ""}`)
        await loadMemory()
        setTimeout(() => setMonitorFeedback(null), 3000)
      } else {
        setMonitorFeedback(`✗ ${data.error ?? "Error al procesar"}`)
      }
    } finally {
      setMonitorLoading(false)
    }
  }

  async function handleRemoveEntity(identifier: string) {
    try {
      await fetch("/api/settings/monitor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      })
      await loadMemory()
    } catch {}
  }

  function handleMonitorKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleMonitorSubmit()
    }
  }

  const waStatusColor =
    waStatus === "connected" ? "success" : waStatus === "connecting" ? "warning" : "default"
  const waStatusLabel =
    waStatus === "connected" ? "Conectado" : waStatus === "connecting" ? "Conectando..." : "Desconectado"

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6 space-y-8">
        <h1 className="text-xl font-bold text-[hsl(var(--text))]">Configuración</h1>

        {gmailConnected && (
          <div className="p-3 rounded-[var(--radius)] bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success)/0.2)] text-sm text-[hsl(var(--success))]">
            Gmail conectado exitosamente.
          </div>
        )}

        {/* ── WhatsApp ───────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">WhatsApp</h2>
            <Badge variant={waStatusColor}>{waStatusLabel}</Badge>
          </div>

          {waStatus === "connected" ? (
            <div className="p-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
              <p className="text-sm text-[hsl(var(--text-2))]">
                Tu WhatsApp está conectado. KITT está recibiendo mensajes.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleReconnect} loading={reconnecting}>
                Reconectar
              </Button>
            </div>
          ) : qrCode ? (
            <div className="p-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-center space-y-3">
              <img src={qrCode} alt="QR WhatsApp" className="w-44 h-44 mx-auto rounded-lg" />
              <p className="text-xs text-[hsl(var(--text-3))]">
                Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo
              </p>
              <Button variant="outline" size="sm" onClick={fetchQR} loading={qrLoading}>
                Actualizar QR
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-[var(--radius)] border border-dashed border-[hsl(var(--border-2))] text-center space-y-2">
              <p className="text-sm text-[hsl(var(--text-3))]">WhatsApp no conectado</p>
              <Button variant="outline" onClick={fetchQR} loading={qrLoading}>
                Conectar WhatsApp
              </Button>
            </div>
          )}
        </section>

        <hr className="border-[hsl(var(--border))]" />

        {/* ── Gmail ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Gmail</h2>
            <Badge variant={gmailEmail || gmailConnected ? "success" : "default"}>
              {gmailEmail || gmailConnected ? "Conectado" : "Desconectado"}
            </Badge>
          </div>

          {gmailEmail || gmailConnected ? (
            <div className="p-4 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] flex items-center justify-between">
              <p className="text-sm text-[hsl(var(--text-2))]">{gmailEmail ?? "Casilla conectada"}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGmailDisconnect}
                loading={disconnectingGmail}
                className="text-[hsl(var(--destructive))]"
              >
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-[var(--radius)] border border-dashed border-[hsl(var(--border-2))] text-center space-y-2">
              <p className="text-sm text-[hsl(var(--text-3))]">Gmail no conectado</p>
              <a href="/api/email/connect">
                <Button variant="outline">
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
                    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
                    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
                    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" />
                  </svg>
                  Conectar Gmail
                </Button>
              </a>
            </div>
          )}
        </section>

        <hr className="border-[hsl(var(--border))]" />

        {/* ── Memoria de KITT ───────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Memoria de KITT</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearMemory}
              loading={clearingMemory}
              className="text-red-500 border-red-500/30 hover:bg-red-500/10 text-xs"
            >
              Reiniciar memoria
            </Button>
          </div>

          {memory ? (
            <div className="space-y-3">
              {/* Barra de progreso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[hsl(var(--text-3))]">
                  <span>{memory.factsCount} / {memory.maxFacts} hechos almacenados</span>
                  <span>{memory.usagePercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[hsl(var(--surface-2))] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      memory.usagePercent >= 80
                        ? "bg-red-500"
                        : memory.usagePercent >= 50
                        ? "bg-amber-500"
                        : "bg-[hsl(var(--accent))]"
                    }`}
                    style={{ width: `${memory.usagePercent}%` }}
                  />
                </div>
                {memory.updatedAt && (
                  <p className="text-[10px] text-[hsl(var(--text-3))]">
                    Actualizado: {new Date(memory.updatedAt).toLocaleString("es-AR")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-8 rounded-lg bg-[hsl(var(--surface-2))] animate-pulse" />
          )}
        </section>

        <hr className="border-[hsl(var(--border))]" />

        {/* ── Monitoreo en segundo plano ─────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">
              Monitoreo en segundo plano
            </h2>
            <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">
              KITT aprendrá automáticamente de estas fuentes sin que tengas que decirle nada.
            </p>
          </div>

          {/* Entidades actuales */}
          {memory && memory.trackedEntities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {memory.trackedEntities.map((entity) => (
                <span
                  key={entity.identifier}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] text-[hsl(var(--text-2))]"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${entity.type === "whatsapp" ? "bg-emerald-500" : "bg-blue-500"}`} />
                  {entity.description}
                  <button
                    type="button"
                    onClick={() => handleRemoveEntity(entity.identifier)}
                    className="ml-0.5 text-[hsl(var(--text-3))] hover:text-red-500 transition-colors"
                    aria-label={`Eliminar ${entity.description}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input de lenguaje natural */}
          <div className="space-y-2">
            <Label>¿A quién debería monitorear KITT?</Label>
            <div className="flex gap-2">
              <Input
                value={monitorInput}
                onChange={(e) => setMonitorInput(e.target.value)}
                onKeyDown={handleMonitorKeyDown}
                placeholder='Ej: "Monitoreá el grupo Ventas y los mails de juan@empresa.com"'
                disabled={monitorLoading}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleMonitorSubmit}
                disabled={!monitorInput.trim() || monitorLoading}
                loading={monitorLoading}
              >
                Agregar
              </Button>
            </div>
            {monitorFeedback && (
              <p className={`text-xs ${monitorFeedback.startsWith("✓") ? "text-emerald-500" : "text-red-500"}`}>
                {monitorFeedback}
              </p>
            )}
          </div>
        </section>

        <hr className="border-[hsl(var(--border))]" />

        {/* ── Comportamiento de KITT ─────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-[hsl(var(--text))]">
            Comportamiento de KITT
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre del asistente</Label>
              <Input
                value={config.assistantName ?? "KITT"}
                onChange={(e) => setConfig((c) => ({ ...c, assistantName: e.target.value }))}
                placeholder="KITT"
              />
            </div>

            <div className="space-y-2">
              <Label>Tono</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["professional", "friendly"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, tone: t }))}
                    className={`p-3 rounded-[var(--radius)] border text-sm text-left transition-all ${
                      (config.tone ?? "professional") === t
                        ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                        : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))]"
                    }`}
                  >
                    {t === "professional" ? "Profesional" : "Amigable"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Modelo de IA</Label>
              <select
                value={config.model ?? "claude-sonnet-4-5-20251001"}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                className="flex h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={saveConfig} loading={saving}>
            {saved ? "Guardado ✓" : "Guardar cambios"}
          </Button>
        </section>
      </div>
    </div>
  )
}
