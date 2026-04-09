"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Step = 1 | 2 | 3 | 4

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)

  // Config del step 4
  const [assistantName, setAssistantName] = useState("KITT")
  const [tone, setTone] = useState<"professional" | "friendly">("professional")

  // QR state
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  async function fetchQR() {
    setQrLoading(true)
    try {
      const res = await fetch("/api/whatsapp/qr")
      if (res.ok) {
        const data = await res.json()
        setQrCode(data.qrcode)
      }
    } finally {
      setQrLoading(false)
    }
  }

  async function handleFinish() {
    setLoading(true)
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { assistantName, tone },
        }),
      })

      // Actualizar token de sesión
      await update({ onboardingDone: true })
      router.push("/chat")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[hsl(var(--background))] p-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  s <= step
                    ? "bg-[hsl(var(--accent))]"
                    : "bg-[hsl(var(--border-2))]"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-[hsl(var(--text-3))]">
            Paso {step} de 4
          </p>
        </div>

        {/* Step 1 — Bienvenida */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="h-14 w-14 rounded-2xl bg-[hsl(var(--accent))] flex items-center justify-center mb-4">
                <span className="text-white text-2xl font-bold">K</span>
              </div>
              <h1 className="text-2xl font-bold text-[hsl(var(--text))]">
                Bienvenido a KITT
              </h1>
              <p className="text-[hsl(var(--text-2))] mt-2">
                En los próximos minutos vas a conectar tus comunicaciones y tu asistente estará listo para trabajar.
              </p>
            </div>

            <div className="space-y-3">
              {[
                "Conectá tu WhatsApp con un QR",
                "Conectá tu Gmail con un click",
                "Configurá el comportamiento de KITT",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-[hsl(var(--text-2))]">
                  <div className="h-6 w-6 rounded-full bg-[hsl(var(--accent-soft))] flex items-center justify-center flex-shrink-0">
                    <span className="text-[hsl(var(--accent))] text-xs font-bold">{i + 1}</span>
                  </div>
                  {item}
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={() => setStep(2)}>
              Empezar →
            </Button>
          </div>
        )}

        {/* Step 2 — WhatsApp */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[hsl(var(--text))]">
                Conectá WhatsApp
              </h2>
              <p className="text-sm text-[hsl(var(--text-2))] mt-1">
                Escaneá el código QR con tu WhatsApp para conectar tu número actual.
              </p>
            </div>

            {!qrCode ? (
              <div className="border border-dashed border-[hsl(var(--border-2))] rounded-xl p-8 text-center space-y-4">
                <p className="text-sm text-[hsl(var(--text-3))]">
                  Hacé click para generar el código QR
                </p>
                <Button
                  variant="outline"
                  onClick={fetchQR}
                  loading={qrLoading}
                >
                  Generar QR
                </Button>
              </div>
            ) : (
              <div className="border border-[hsl(var(--border))] rounded-xl p-4 text-center space-y-3">
                <img
                  src={qrCode}
                  alt="QR WhatsApp"
                  className="w-48 h-48 mx-auto rounded-lg"
                />
                <p className="text-xs text-[hsl(var(--text-3))]">
                  Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </p>
                <Button variant="ghost" size="sm" onClick={fetchQR} loading={qrLoading}>
                  Actualizar QR
                </Button>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                {qrCode ? "Ya escaneé →" : "Saltar por ahora →"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Gmail */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[hsl(var(--text))]">
                Conectá Gmail
              </h2>
              <p className="text-sm text-[hsl(var(--text-2))] mt-1">
                KITT va a poder leer y responder emails desde tu casilla. Solo con tu aprobación.
              </p>
            </div>

            <div className="border border-[hsl(var(--border))] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--text))]">Gmail</p>
                  <p className="text-xs text-[hsl(var(--text-3))]">
                    Lectura y envío con tu aprobación
                  </p>
                </div>
              </div>

              <a href="/api/email/connect">
                <Button className="w-full" variant="outline">
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

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Atrás
              </Button>
              <Button className="flex-1" onClick={() => setStep(4)}>
                Continuar →
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — Configuración */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[hsl(var(--text))]">
                Personalizá a KITT
              </h2>
              <p className="text-sm text-[hsl(var(--text-2))] mt-1">
                Podés cambiar esto en cualquier momento desde Configuración.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre del asistente</Label>
                <Input
                  id="name"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="KITT"
                />
              </div>

              <div className="space-y-2">
                <Label>Tono de comunicación</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["professional", "friendly"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`p-3 rounded-[var(--radius)] border text-sm text-left transition-all ${
                        tone === t
                          ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                          : "border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent))]"
                      }`}
                    >
                      <div className="font-medium">
                        {t === "professional" ? "Profesional" : "Amigable"}
                      </div>
                      <div className="text-xs mt-0.5 opacity-70">
                        {t === "professional" ? "Conciso y directo" : "Cercano y cálido"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                Atrás
              </Button>
              <Button className="flex-1" onClick={handleFinish} loading={loading}>
                Terminar configuración
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
