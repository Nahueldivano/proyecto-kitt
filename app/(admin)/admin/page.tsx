"use client"

import { useEffect, useState } from "react"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface Tenant {
  id: string
  name: string
  createdAt: string
  users: { id: string; email: string; onboardingDone: boolean }[]
  whatsappSession: { status: string } | null
  gmailConnection: { email: string } | null
  _count: { conversations: number; reports: number; pendingActions: number }
}

interface ConfigEntry {
  value: string
  display: string
  source: "db" | "env" | "empty"
}

const N8N_WORKFLOWS = [
  { id: "uR96DOWSYpdDA0BA", name: "Agente Madre", webhook: "/webhook/kitt-chat" },
  { id: "vx4trQrMlquhBZyu", name: "WhatsApp Incoming", webhook: "/webhook/wa-incoming" },
  { id: "x6h31hwTmblmM3Js", name: "Reporte Matutino", schedule: "8:00 AM" },
  { id: "tmHQdJdeeagEbsEr", name: "Reporte Intermedio", schedule: "1:00 PM" },
  { id: "89buVf4MS49y9j7k", name: "Reporte Nocturno", schedule: "7:00 PM" },
]

const CONFIG_LABELS: Record<string, string> = {
  anthropicApiKey: "Anthropic API Key (Claude)",
  evolutionUrl: "Evolution API URL",
  evolutionKey: "Evolution API Key",
  googleClientId: "Google Client ID",
  googleClientSecret: "Google Client Secret",
  kittInternalKey: "KITT Internal Key (n8n)",
  kittAdminEmail: "Admin Email",
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [config, setConfig] = useState<Record<string, ConfigEntry>>({})
  const [configInputs, setConfigInputs] = useState<Record<string, string>>({})
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<"overview" | "system" | "tenants" | "workflows">("overview")

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants ?? []))
      .catch(() => {})
      .finally(() => setLoadingTenants(false))

    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config ?? {}))
      .catch(() => {})
  }, [])

  async function saveConfig() {
    setSavingConfig(true)
    try {
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configInputs),
      })
      setConfigSaved(true)
      setConfigInputs({})

      // Refrescar config
      const res = await fetch("/api/admin/config")
      const data = await res.json()
      setConfig(data.config ?? {})

      setTimeout(() => setConfigSaved(false), 2000)
    } finally {
      setSavingConfig(false)
    }
  }

  const totalTenants = tenants.length
  const waConnected = tenants.filter((t) => t.whatsappSession?.status === "connected").length
  const gmailConnected = tenants.filter((t) => !!t.gmailConnection).length
  const totalReports = tenants.reduce((sum, t) => sum + t._count.reports, 0)

  const tabs = [
    { key: "overview", label: "Resumen" },
    { key: "system", label: "Sistema" },
    { key: "tenants", label: "Clientes" },
    { key: "workflows", label: "n8n" },
  ] as const

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Header admin */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[hsl(var(--accent))] flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--text))]">
              KITT Admin — Smart Growth
            </h1>
            <p className="text-xs text-[hsl(var(--text-3))]">Panel de administración</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-[hsl(var(--border))]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                  : "border-transparent text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Resumen */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Clientes", value: totalTenants },
              { label: "WA Activos", value: waConnected },
              { label: "Gmail Conectados", value: gmailConnected },
              { label: "Reportes", value: totalReports },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold text-[hsl(var(--text))]">{stat.value}</p>
                  <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tab: Sistema */}
        {activeTab === "system" && (
          <Card>
            <CardHeader>
              <CardTitle>API Keys y Configuración Global</CardTitle>
              <CardDescription>
                Los valores se guardan en la base de datos y se leen en runtime.
                Podés dejar campos vacíos para usar las variables de entorno del servidor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(CONFIG_LABELS).map(([key, label]) => {
                const entry = config[key]
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label>{label}</Label>
                      {entry && (
                        <Badge variant={entry.source === "empty" ? "default" : "success"} className="text-[10px]">
                          {entry.source === "db" ? "DB" : entry.source === "env" ? ".env" : "vacío"}
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="password"
                      placeholder={entry?.display ?? "No configurado"}
                      value={configInputs[key] ?? ""}
                      onChange={(e) =>
                        setConfigInputs((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                )
              })}

              <Button
                onClick={saveConfig}
                loading={savingConfig}
                disabled={Object.keys(configInputs).length === 0}
              >
                {configSaved ? "Guardado ✓" : "Guardar configuración"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tab: Clientes */}
        {activeTab === "tenants" && (
          <div className="space-y-3">
            {loadingTenants ? (
              <p className="text-sm text-[hsl(var(--text-3))]">Cargando...</p>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-3))]">No hay clientes registrados</p>
            ) : (
              tenants.map((tenant) => (
                <Card key={tenant.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[hsl(var(--text))] truncate">
                          {tenant.name}
                        </p>
                        <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">
                          {tenant.users[0]?.email ?? "Sin usuario"} · Desde {formatDate(tenant.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={tenant.whatsappSession?.status === "connected" ? "success" : "default"}>
                          WA
                        </Badge>
                        <Badge variant={tenant.gmailConnection ? "success" : "default"}>
                          Gmail
                        </Badge>
                        <Badge variant={tenant.users[0]?.onboardingDone ? "success" : "default"}>
                          {tenant.users[0]?.onboardingDone ? "Activo" : "Onboarding"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex gap-4 mt-3 text-xs text-[hsl(var(--text-3))]">
                      <span>{tenant._count.conversations} conversaciones</span>
                      <span>{tenant._count.reports} reportes</span>
                      <span>{tenant._count.pendingActions} acciones</span>
                      {tenant.users[0] && !tenant.users[0].onboardingDone && (
                        <button
                          onClick={async () => {
                            const r = await fetch("/api/admin/tenants", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: tenant.users[0].id, onboardingDone: true }),
                            })
                            if (r.ok) window.location.reload()
                          }}
                          className="ml-auto text-[hsl(var(--accent))] hover:underline"
                        >
                          Marcar como activo →
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Tab: n8n */}
        {activeTab === "workflows" && (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--text-2))]">
              IDs de workflows en la instancia de n8n de Smart Growth.
            </p>
            {N8N_WORKFLOWS.map((wf) => (
              <Card key={wf.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--text))]">{wf.name}</p>
                    <p className="text-xs text-[hsl(var(--text-3))] font-mono mt-0.5">{wf.id}</p>
                    {wf.webhook && (
                      <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">Webhook: {wf.webhook}</p>
                    )}
                    {wf.schedule && (
                      <p className="text-xs text-[hsl(var(--text-3))] mt-0.5">Cron: {wf.schedule}</p>
                    )}
                  </div>
                  <Badge variant="outline">Activo</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
