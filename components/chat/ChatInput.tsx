"use client"

import { useState, useRef, KeyboardEvent, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { VoiceButton } from "./VoiceButton"
import { useChatStore } from "@/lib/store"
import { AVAILABLE_MODELS } from "@/lib/models"

const QUICK_ACTIONS = [
  { label: "Ver emails nuevos", prompt: "Mostrame los emails no leídos que tengo" },
  { label: "Resumen de WhatsApp de hoy", prompt: "Dame un resumen de los mensajes de WhatsApp de hoy" },
  { label: "Crear un documento", prompt: "Crea un documento en blanco para que pueda escribir" },
  { label: "Qué tengo pendiente", prompt: "¿Qué tengo pendiente o sin resolver hoy?" },
]

interface ChatInputProps {
  onSend: (message: string) => void
  onCancel?: () => void
  disabled?: boolean
  isStreaming?: boolean
  onArtifactMode?: () => void
}

export function ChatInput({ onSend, onCancel, disabled = false, isStreaming = false, onArtifactMode }: ChatInputProps) {
  const [value, setValue] = useState("")
  const [modelOpen, setModelOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    selectedModel, setSelectedModel,
    webSearchEnabled, toggleWebSearch,
    attachedFiles, addAttachedFile, removeAttachedFile,
  } = useChatStore()

  const selectedModelInfo = AVAILABLE_MODELS.find((m) => m.id === selectedModel) ?? AVAILABLE_MODELS[1]

  function handleSend() {
    const trimmed = value.trim()
    if ((!trimmed && attachedFiles.length === 0) || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    for (const file of files.slice(0, 5)) {
      const formData = new FormData()
      formData.append("file", file)
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData })
        if (res.ok) {
          const data = await res.json()
          addAttachedFile({ name: data.name, type: data.type, content: data.content, size: data.size })
        }
      } catch { /* silencioso */ }
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [addAttachedFile])

  // Input file hidden siempre
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.csv,.png,.jpg,.jpeg"
      onChange={handleFileChange}
      className="hidden"
    />
  )

  // Botones de toolbar reutilizables
  const attachBtn = (size: number = 15) => (
    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}
      title="Adjuntar archivo"
      className="p-1.5 rounded-lg text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))] transition-colors disabled:opacity-40">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    </button>
  )

  const sendOrCancel = (size: "sm" | "md" = "md") => isStreaming ? (
    <button type="button" onClick={onCancel}
      className={`${size === "md" ? "h-10 w-10" : "h-8 w-8"} rounded-full border border-red-500/40 text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors`}
      aria-label="Cancelar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
    </button>
  ) : (
    <Button type="button" onClick={handleSend}
      disabled={disabled || (!value.trim() && attachedFiles.length === 0)}
      size="icon"
      className={`${size === "md" ? "h-10 w-10" : "h-8 w-8"} rounded-full`}
      aria-label="Enviar">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
      </svg>
    </Button>
  )

  return (
    <div className="bg-[hsl(var(--background))] md:bg-[hsl(var(--surface))] md:border-t md:border-[hsl(var(--border))] px-3 py-3 pb-safe">
      {fileInput}

      {/* Archivos adjuntos */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-3xl mx-auto">
          {attachedFiles.map((f) => (
            <div key={f.name} className="flex items-center gap-1.5 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg px-2 py-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="text-xs text-[hsl(var(--text-2))] max-w-[120px] truncate">{f.name}</span>
              <button onClick={() => removeAttachedFile(f.name)} className="text-[hsl(var(--text-3))] hover:text-red-500 ml-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── MOBILE layout ── */}
      <div className="md:hidden max-w-3xl mx-auto space-y-2">
        {/* Input pill — sin toolbar dentro, limpio como Claude */}
        <div className="rounded-2xl border border-[hsl(var(--border-2))] bg-[hsl(var(--surface))] focus-within:ring-2 focus-within:ring-[hsl(var(--accent))] focus-within:border-[hsl(var(--accent))] transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Escríbele a KITT..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-[15px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none max-h-40 min-h-[52px] leading-6 disabled:opacity-50"
          />
        </div>

        {/* Fila inferior: [+] izquierda — [mic] [send] derecha */}
        <div className="flex items-center justify-between px-1">
          {/* Izquierda: botón + para adjuntar */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="h-11 w-11 flex items-center justify-center rounded-full border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] active:scale-95 transition-all disabled:opacity-40"
            aria-label="Adjuntar archivo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {/* Derecha: micrófono + enviar */}
          <div className="flex items-center gap-2">
            <VoiceButton
              onTranscript={(t) => setValue((prev) => prev ? `${prev} ${t}` : t)}
              disabled={disabled}
            />
            {sendOrCancel("md")}
          </div>
        </div>
      </div>

      {/* ── DESKTOP layout — igual que antes ── */}
      <div className="hidden md:block max-w-3xl mx-auto">
        {/* Chips de acciones rápidas */}
        {!isStreaming && !disabled && messages.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_ACTIONS.map((a) => (
              <button key={a.label} onClick={() => onSend(a.prompt)}
                className="text-xs px-3 py-1.5 rounded-full border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))] transition-colors">
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative rounded-2xl border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] focus-within:ring-2 focus-within:ring-[hsl(var(--accent))] focus-within:border-[hsl(var(--accent))] transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Pregúntale algo a KITT..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-12 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none max-h-40 min-h-[52px] leading-6 disabled:opacity-50"
          />

          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {attachBtn(15)}
              <VoiceButton onTranscript={(t) => setValue((prev) => prev ? `${prev} ${t}` : t)} disabled={disabled} />
              <button type="button" onClick={onArtifactMode} disabled={disabled} title="Crear documento"
                className="p-1.5 rounded-lg text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))] transition-colors disabled:opacity-40">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </button>
              <button type="button" onClick={toggleWebSearch} disabled={disabled}
                title={webSearchEnabled ? "Web Search activo" : "Activar Web Search"}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${webSearchEnabled ? "text-[hsl(var(--accent))] bg-[hsl(var(--accent-soft))]" : "text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))]"}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative" ref={modelRef}>
                <button type="button" onClick={() => setModelOpen((v) => !v)} disabled={disabled}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))] transition-colors border border-[hsl(var(--border))] disabled:opacity-40">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <span>{selectedModelInfo.name.replace("Claude ", "")}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {modelOpen && (
                  <div className="absolute bottom-full mb-2 right-0 bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-xl shadow-xl py-1 w-64 z-50">
                    {AVAILABLE_MODELS.map((m) => (
                      <button key={m.id} onClick={() => { setSelectedModel(m.id); setModelOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-[hsl(var(--surface-2))] transition-colors ${m.id === selectedModel ? "bg-[hsl(var(--accent-soft))]" : ""}`}>
                        <div className="text-sm font-medium text-[hsl(var(--text))]">{m.name}</div>
                        <div className="text-xs text-[hsl(var(--text-3))] mt-0.5">{m.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {sendOrCancel("sm")}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-[hsl(var(--text-3))] mt-1.5">
          {isStreaming ? "KITT está respondiendo... · Clic en rojo para cancelar" : "Enter para enviar · Shift+Enter para nueva línea"}
        </p>
      </div>
    </div>
  )
}
