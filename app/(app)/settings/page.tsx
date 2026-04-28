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
  const [waPrompt, setWaPrompt] = useState("")
  const [gmailPrompt, setGmailPrompt] = useState("")

  const gmailConnected = searchParams.get("gmail") === "connected" || !!gmailEmail

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config ?? {})
        if (d.gmailEmail) setGmailEmail(d.gmailEmail)
        setWaPrompt(d.config?.waMonitorPrompt ?? "")
        setGmailPrompt(d.config?.gmailMonitorPrompt ?? "")
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
      if (res.ok) setMemory(await res.json())
    } catch {}
  }

  async function saveConfig(extra?: Record<string, unknown>) {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...config, ...extra }
      if (apiKeyInput.trim()) payload.anthropicApiKey = apiKeyInput.trim()
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setSaved(true)
      setApiKeyInput("")
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
    await saveConfig({ waMonitorPrompt: waPrompt, gmailMonitorPrompt: gmailPrompt })
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

              <div className="space-y-1.5">
                <Label>Qué contactos y grupos monitorear</Label>
                <textarea
                  rows={3}
                  value={waPrompt}
                  onChange={(e) => setWaPrompt(e.target.value)}
                  placeholder='Ej: "Monitoreá el grupo Proveedores y los mensajes de Juan Perez (011-xxxx)"'
                  className="w-full text-sm resize-none bg-[hsl(var(--background))] border border-[hsl(var(--border-2))] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[hsl(var(--accent))] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))]"
                />
                <p className="text-xs text-[hsl(var(--text-3))]">KITT usará este criterio para filtrar mensajes relevantes</p>
              </div>
            </Section>

            {/* Gmail */}
            <Section title="Gmail">
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
