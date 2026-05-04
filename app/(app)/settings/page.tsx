"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AVAILABLE_MODELS } from "@/lib/models"

type Tab = "perfil" | "conexiones" | "asistente" | "onboarding" | "memoria"

interface TenantConfig {
  assistantName?: string
  tone?: string
  model?: string
  anthropicApiKey?: string
  openaiApiKey?: string
  waMonitorPrompt?: string
  gmailMonitorPrompt?: string
}

interface MemoryStats {
  usagePercent: number
  factsCount: number
  maxFacts: number
  updatedAt?: string
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, update } = useSession()

  const [tab, setTab] = useState<Tab>("perfil")
  const [config, setConfig] = useState<TenantConfig>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [waStatus, setWaStatus] = useState<string>("disconnected")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [memory, setMemory] = useState<MemoryStats | null>(null)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [resettingOnboarding, setResettingOnboarding] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [openaiKeyVisible, setOpenaiKeyVisible] = useState(false)
  const [openaiKeyInput, setOpenaiKeyInput] = useState("")
  const [waPrompt, setWaPrompt] = useState("")
  const [gmailPrompt, setGmailPrompt] = useState("")
  const [waHistoryDays, setWaHistoryDays] = useState<number>(7)
  const [waUseCustomRange, setWaUseCustomRange] = useState(false)
  const [waCustomSince, setWaCustomSince] = useState("")
  const [waCustomUntil, setWaCustomUntil] = useState("")
  const [waChats, setWaChats] = useState<{ jid: string; name: string | null }[]>([])
  const [waWhitelist, setWaWhitelist] = useState<string[]>([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const gmailConnected = searchParams.get("gmail") === "connected" || !!gmailEmail

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config ?? {})
        if (d.gmailEmail) setGmailEmail(d.gmailEmail)
        setWaPrompt(d.config?.waMonitorPrompt ?? "")
        setGmailPrompt(d.config?.gmailMonitorPrompt ?? "")
        setWaHistoryDays(Number(d.config?.waHistoryDays ?? 30))
        setWaWhitelist(Array.isArray(d.config?.waContactWhitelist) ? d.config.waContactWhitelist : [])
      })
      .catch(() => {})

    fetch("/api/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setWaStatus(d.status))
      .catch(() => {})

    loadMemory()
  }, [])

  // Polling de estado WhatsApp en tiempo real mientras se está mostrando QR
  // o el status no es "connected". Se detiene al conectarse.
  useEffect(() => {
    if (waStatus === "connected" && !qrCode) return
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/whatsapp/status")
        if (!res.ok) return
        const d = await res.json()
        if (d.status && d.status !== waStatus) {
          setWaStatus(d.status)
          if (d.status === "connected") setQrCode(null)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(id)
  }, [waStatus, qrCode])

  async function loadMemory() {
    try {
      const res = await fetch("/api/memory")
      if (res.ok) setMemory(await res.json())
    } catch {}
  }

  async function saveConfig(extra?: Record<string, unknown>) {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...config, ...extra }
      if (apiKeyInput.trim()) payload.anthropicApiKey = apiKeyInput.trim()
      if (openaiKeyInput.trim()) payload.openaiApiKey = openaiKeyInput.trim()
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setSaved(true)
      setApiKeyInput("")
      setOpenaiKeyInput("")
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleQR() {
    setQrLoading(true)
    try {
      const res = await fetch("/api/whatsapp/qr")
      if (res.ok) { const d = await res.json(); setQrCode(d.qrcode); setWaStatus("connecting") }
    } finally { setQrLoading(false) }
  }

  async function handleGmailConnect() {
    const res = await fetch("/api/email/connect")
    if (res.ok) { const d = await res.json(); if (d.url) window.location.href = d.url }
  }

  async function handleGmailDisconnect() {
    await fetch("/api/email/disconnect", { method: "POST" })
    setGmailEmail(null)
  }

  async function handleClearMemory() {
    if (!confirm("¿Borrar toda la memoria de KITT?")) return
    setClearingMemory(true)
    try { await fetch("/api/memory", { method: "DELETE" }); await loadMemory() }
    finally { setClearingMemory(false) }
  }

  async function handleResetOnboarding() {
    if (!confirm("¿Resetear el onboarding? Esto borrará la configuración actual del asistente.")) return
    setResettingOnboarding(true)
    try {
      await fetch("/api/onboarding/reset", { method: "POST" })
      await update({ onboardingDone: false })
      router.push("/onboarding")
    } finally { setResettingOnboarding(false) }
  }

  async function saveMonitorPrompts() {
    await saveConfig({
      waMonitorPrompt: waPrompt,
      gmailMonitorPrompt: gmailPrompt,
      waHistoryDays,
      waContactWhitelist: waWhitelist,
    })
  }

  async function loadWaChats() {
    setLoadingChats(true)
    try {
      const res = await fetch("/api/whatsapp/sync")
      if (res.ok) {
        const d = await res.json()
        setWaChats(d.chats ?? [])
      }
    } catch {} finally { setLoadingChats(false) }
  }

  function toggleWhitelist(jid: string) {
    setWaWhitelist((prev) =>
      prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid]
    )
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const body: Record<string, unknown> = {}
      if (waUseCustomRange) {
        if (waCustomSince) body.since = new Date(waCustomSince).toISOString()
        if (waCustomUntil) body.until = new Date(waCustomUntil + "T23:59:59").toISOString()
      } else {
        body.historyDays = waHistoryDays
      }
      const res = await fetch("/api/whatsapp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok) {
        const rangeLabel = waUseCustomRange
          ? `${waCustomSince || "?"} → ${waCustomUntil || "hoy"}`
          : `últimos ${waHistoryDays} días`
        setSyncResult(`Sincronizado: ${d.messagesSaved} mensajes de ${d.chatsProcessed} chats (${rangeLabel})`)
      } else {
        setSyncResult(`Error: ${d.error ?? "desconocido"}`)
      }
    } catch { setSyncResult("Error al sincronizar") } finally { setSyncing(false) }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "perfil", label: "Perfil" },
    { id: "conexiones", label: "Conexiones" },
    { id: "asistente", label: "Asistente" },
    { id: "onboarding", label: "Onboarding" },
    { id: "memoria", label: "Memoria" },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-[hsl(var(--text))] mb-1">Configuración</h1>
        <p className="text-sm text-[hsl(var(--text-3))] mb-6">Personalizá KITT para tu negocio</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[hsl(var(--border))]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                  : "border-transparent text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── PERFIL ─── */}
        {tab === "perfil" && (
          <div className="space-y-5">
            <Section title="Datos de la cuenta">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={session?.user?.name ?? ""} disabled className="opacity-60" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={session?.user?.email ?? ""} disabled className="opacity-60" />
              </div>
            </Section>

            <Section title="API Key de Anthropic">
              <p className="text-xs text-[hsl(var(--text-3))] mb-3">
                Necesaria para que KITT funcione. Conseguila en console.anthropic.com
              </p>
              <div className="flex gap-2">
                <Input
                  type={apiKeyVisible ? "text" : "password"}
                  placeholder="sk-ant-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <Button variant="outline" onClick={() => setApiKeyVisible((v) => !v)} className="shrink-0">
                  {apiKeyVisible ? "Ocultar" : "Ver"}
                </Button>
              </div>
              <p className="text-xs text-[hsl(var(--text-3))] mt-2">
                {config.anthropicApiKey ? "API key guardada (encriptada)" : "Sin API key configurada"}
              </p>
            </Section>

            <Section title="API Key de OpenAI">
              <p className="text-xs text-[hsl(var(--text-3))] mb-3">
                Opcional. Se usa para transcribir audios de WhatsApp con Whisper. Conseguila en platform.openai.com
              </p>
              <div className="flex gap-2">
                <Input
                  type={openaiKeyVisible ? "text" : "password"}
                  placeholder="sk-..."
                  value={openaiKeyInput}
                  onChange={(e) => setOpenaiKeyInput(e.target.value)}
                />
                <Button variant="outline" onClick={() => setOpenaiKeyVisible((v) => !v)} className="shrink-0">
                  {openaiKeyVisible ? "Ocultar" : "Ver"}
                </Button>
              </div>
              <p className="text-xs text-[hsl(var(--text-3))] mt-2">
                {config.openaiApiKey ? "API key guardada (encriptada)" : "Sin API key configurada"}
              </p>
            </Section>

            <Button onClick={() => saveConfig()} loading={saving} className="w-full">
              {saved ? "Guardado" : "Guardar cambios"}
            </Button>
          </div>
        )}

        {/* ─── CONEXIONES ─── */}
        {tab === "conexiones" && (
          <div className="space-y-6">
            {/* WhatsApp */}
            <Section title="WhatsApp">
              {/* Estado + conexión */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${waStatus === "connected" ? "bg-green-500" : waStatus === "connecting" ? "bg-yellow-500" : "bg-[hsl(var(--text-3))]"}`} />
                  <span className="text-sm text-[hsl(var(--text-2))]">
                    {waStatus === "connected" ? "Conectado" : waStatus === "connecting" ? "Conectando..." : "Desconectado"}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleQR} loading={qrLoading}>
                  {waStatus === "connected" ? "Reconectar" : "Conectar"}
                </Button>
              </div>

              {qrCode && (
                <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR WhatsApp"
                    className="w-48 h-48"
                  />
                  <p className="text-xs text-gray-500">Escaneá con WhatsApp</p>
                </div>
              )}

              {/* Ventana de tiempo */}
              <div className="space-y-2 mb-4">
                <Label>Ventana de historial a sincronizar</Label>
                <div className="flex gap-2">
                  {[{ days: 7, label: "1 semana" }, { days: 15, label: "15 días" }, { days: 30, label: "30 días" }].map(({ days, label }) => (
                    <button
                      key={days}
                      onClick={() => { setWaHistoryDays(days); setWaUseCustomRange(false) }}
                      className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors ${
                        !waUseCustomRange && waHistoryDays === days
                          ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                          : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent))]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => setWaUseCustomRange(true)}
                    className={`flex-1 py-1.5 rounded-lg border text-sm transition-colors ${
                      waUseCustomRange
                        ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                        : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent))]"
                    }`}
                  >
                    Rango
                  </button>
                </div>
                {waUseCustomRange && (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] text-[hsl(var(--text-3))]">Desde</p>
                      <input
                        type="date"
                        value={waCustomSince}
                        onChange={(e) => setWaCustomSince(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] text-[hsl(var(--text-3))]">Hasta</p>
                      <input
                        type="date"
                        value={waCustomUntil}
                        onChange={(e) => setWaCustomUntil(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] text-[hsl(var(--text))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-[hsl(var(--text-3))]">
                  KITT sincroniza todos los mensajes dentro de esta ventana de tiempo.
                </p>
              </div>

              {/* Whitelist de contactos/grupos */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <Label>Contactos y grupos a sincronizar</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadWaChats}
                    loading={loadingChats}
                  >
                    {loadingChats ? "Cargando..." : "Cargar chats"}
                  </Button>
                </div>

                {waChats.length > 0 ? (
                  <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden">
                    <div className="p-2 bg-[hsl(var(--surface-2))] border-b border-[hsl(var(--border))]">
                      <p className="text-xs text-[hsl(var(--text-3))]">
                        {waWhitelist.length === 0
                          ? "Sin filtro — se sincronizan todos los chats de la ventana de tiempo"
                          : `${waWhitelist.length} seleccionado(s) — solo estos chats se sincronizan`}
                      </p>
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-[hsl(var(--border))]">
                      {waChats.map((c) => {
                        const isSelected = waWhitelist.includes(c.jid)
                        const isGroup = c.jid.endsWith("@g.us")
                        const isLid = c.jid.endsWith("@lid")
                        const badge = isGroup ? "Grupo" : isLid ? "LID" : "Contacto"
                        const badgeColor = isGroup
                          ? "bg-purple-500/20 text-purple-400"
                          : isLid
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-blue-500/20 text-blue-400"
                        const cleanNumber = c.jid.replace(/@.+$/, "")
                        const displayLabel = c.name?.trim()
                          ? c.name
                          : isGroup
                          ? `Grupo ${cleanNumber.slice(-6)}`
                          : `+${cleanNumber}`
                        return (
                          <button
                            key={c.jid}
                            onClick={() => toggleWhitelist(c.jid)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--surface-2))] ${isSelected ? "bg-[hsl(var(--accent-soft))]" : ""}`}
                          >
                            <span className={`h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] font-bold transition-colors ${
                              isSelected
                                ? "bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white"
                                : "border-[hsl(var(--border-2))]"
                            }`}>
                              {isSelected ? "✓" : ""}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                                <p className="text-sm text-[hsl(var(--text))] truncate">{displayLabel}</p>
                              </div>
                              {c.name && <p className="text-[10px] text-[hsl(var(--text-3))] truncate">+{cleanNumber}</p>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {waWhitelist.length > 0 && (
                      <div className="p-2 border-t border-[hsl(var(--border))]">
                        <button
                          onClick={() => setWaWhitelist([])}
                          className="text-xs text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]"
                        >
                          Limpiar selección (sincronizar todos)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[hsl(var(--text-3))]">
                    Presioná "Cargar chats" para ver tus contactos y grupos disponibles (requiere WhatsApp conectado).
                  </p>
                )}
              </div>

              {/* Sincronizar */}
              {waStatus === "connected" && (
                <div className="space-y-2">
                  <Button
                    onClick={handleSync}
                    loading={syncing}
                    className="w-full"
                    variant="outline"
                  >
                    {syncing ? "Sincronizando..." : "Sincronizar WhatsApp ahora"}
                  </Button>
                  {syncResult && (
                    <p className={`text-xs ${syncResult.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                      {syncResult}
                    </p>
                  )}
                  <p className="text-xs text-[hsl(var(--text-3))]">
                    Sincroniza todos los mensajes de los últimos {waHistoryDays === 7 ? "7 días (1 semana)" : `${waHistoryDays} días`}. Guardá la config antes de sincronizar.
                  </p>
                </div>
              )}
            </Section>

            {/* Gmail */}
            <Section title="Gmail">
              {/* Banner de éxito al volver del OAuth */}
              {searchParams.get("gmail") === "connected" && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Gmail conectado correctamente
                </div>
              )}
              {searchParams.get("error") === "gmail_denied" && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Permiso denegado en Google
                </div>
              )}
              {searchParams.get("error") === "gmail_failed" && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Error al conectar Gmail. Intentá de nuevo.
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${gmailConnected ? "bg-green-500" : "bg-[hsl(var(--text-3))]"}`} />
                  <span className="text-sm text-[hsl(var(--text-2))]">
                    {gmailConnected ? (gmailEmail ?? "Conectado") : "Desconectado"}
                  </span>
                </div>
                {gmailConnected ? (
                  <Button variant="outline" size="sm" onClick={handleGmailDisconnect}>Desconectar</Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleGmailConnect}>Conectar Gmail</Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Qué casillas y remitentes monitorear</Label>
                <textarea
                  rows={3}
                  value={gmailPrompt}
                  onChange={(e) => setGmailPrompt(e.target.value)}
                  placeholder='Ej: "Emails de clientes con asunto factura o pago, y todo lo que venga de proveedor@empresa.com"'
                  className="w-full text-sm resize-none bg-[hsl(var(--background))] border border-[hsl(var(--border-2))] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[hsl(var(--accent))] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))]"
                />
              </div>
            </Section>

            <Button onClick={saveMonitorPrompts} loading={saving} className="w-full">
              {saved ? "Guardado" : "Guardar configuración de monitoreo"}
            </Button>
          </div>
        )}

        {/* ─── ASISTENTE ─── */}
        {tab === "asistente" && (
          <div className="space-y-5">
            <Section title="Personalidad">
              <div className="space-y-1.5">
                <Label>Nombre del asistente</Label>
                <Input
                  value={config.assistantName ?? "KITT"}
                  onChange={(e) => setConfig((c) => ({ ...c, assistantName: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Tono</Label>
                <div className="flex gap-3">
                  {[{ id: "professional", label: "Profesional" }, { id: "friendly", label: "Amigable" }].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setConfig((c) => ({ ...c, tone: t.id }))}
                      className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                        config.tone === t.id
                          ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                          : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent))]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Modelo de IA por defecto">
              <div className="space-y-2">
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setConfig((c) => ({ ...c, model: m.id }))}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      config.model === m.id
                        ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))]"
                        : "border-[hsl(var(--border-2))] hover:border-[hsl(var(--accent))]"
                    }`}
                  >
                    <div className="text-sm font-medium text-[hsl(var(--text))]">{m.name}</div>
                    <div className="text-xs text-[hsl(var(--text-3))] mt-0.5">{m.description}</div>
                  </button>
                ))}
              </div>
            </Section>

            <Button onClick={() => saveConfig()} loading={saving} className="w-full">
              {saved ? "Guardado" : "Guardar"}
            </Button>
          </div>
        )}

        {/* ─── ONBOARDING ─── */}
        {tab === "onboarding" && (
          <div className="space-y-5">
            <Section title="Estado del onboarding">
              <p className="text-sm text-[hsl(var(--text-2))] mb-4">
                El onboarding guiado por IA configura KITT la primera vez. Podés volver a hacerlo si querés cambiar toda la configuración desde cero.
              </p>
              <div className="p-4 bg-[hsl(var(--surface-2))] rounded-xl mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-[hsl(var(--text))]">Onboarding completado</span>
                </div>
                <p className="text-xs text-[hsl(var(--text-3))]">
                  Asistente: {config.assistantName ?? "KITT"} · Tono: {config.tone ?? "professional"}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleResetOnboarding}
                loading={resettingOnboarding}
                className="w-full border-red-500/40 text-red-500 hover:bg-red-500/10"
              >
                Resetear onboarding y volver a empezar
              </Button>
              <p className="text-xs text-[hsl(var(--text-3))] mt-2 text-center">
                Esto borrará la configuración actual del asistente
              </p>
            </Section>
          </div>
        )}

        {/* ─── MEMORIA ─── */}
        {tab === "memoria" && (
          <div className="space-y-5">
            <Section title="Uso de memoria">
              {memory ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[hsl(var(--text-2))]">
                      {memory.factsCount} / {memory.maxFacts} hechos almacenados
                    </span>
                    <span className="text-sm font-medium text-[hsl(var(--text))]">
                      {Math.round(memory.usagePercent)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[hsl(var(--surface-2))] rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all ${memory.usagePercent > 80 ? "bg-red-500" : "bg-[hsl(var(--accent))]"}`}
                      style={{ width: `${memory.usagePercent}%` }}
                    />
                  </div>
                  {memory.updatedAt && (
                    <p className="text-xs text-[hsl(var(--text-3))] mb-4">
                      Última actualización: {new Date(memory.updatedAt).toLocaleString("es-AR")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[hsl(var(--text-3))] mb-4">Cargando estadísticas de memoria...</p>
              )}

              <p className="text-sm text-[hsl(var(--text-2))] mb-4">
                KITT aprende sobre tu negocio con cada conversación. Esta memoria persiste entre sesiones para que no tengas que repetir contexto.
              </p>
              <Button
                variant="outline"
                onClick={handleClearMemory}
                loading={clearingMemory}
                className="w-full border-red-500/40 text-red-500 hover:bg-red-500/10"
              >
                Reiniciar memoria de KITT
              </Button>
              <p className="text-xs text-[hsl(var(--text-3))] mt-2 text-center">
                Acción irreversible — KITT perderá todo el contexto aprendido
              </p>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl space-y-4">
      <h2 className="text-sm font-semibold text-[hsl(var(--text))]">{title}</h2>
      {children}
    </div>
  )
}
