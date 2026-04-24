"use client"

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

interface Message {
  role: "user" | "assistant"
  content: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()

  const [history, setHistory] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [input, setInput] = useState("")
  const [started, setStarted] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamingRef = useRef("")

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, streamingText, isLoading])

  // Auto-start: Claude saluda primero
  useEffect(() => {
    if (!started) {
      setStarted(true)
      sendToApi([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendToApi = useCallback(
    async (messages: Message[]) => {
      setIsLoading(true)
      streamingRef.current = ""
      setStreamingText("")

      try {
        const res = await fetch("/api/onboarding/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        })

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "Error de conexión" }))
          setHistory((prev) => [
            ...prev,
            { role: "assistant", content: err.error ?? "Error al conectar con KITT." },
          ])
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue
            try {
              const data = JSON.parse(part.slice(6))

              if (data.type === "text") {
                streamingRef.current += data.text
                setStreamingText(streamingRef.current)
              } else if (data.type === "turn_end") {
                const assistantMsg: Message = {
                  role: "assistant",
                  content: streamingRef.current || "Procesé tu solicitud.",
                }
                setHistory((prev) => [...prev, assistantMsg])
                setStreamingText("")
                streamingRef.current = ""
              } else if (data.type === "finalized") {
                setIsDone(true)
                await update({ onboardingDone: true })
                setTimeout(() => router.push("/chat"), 1800)
              } else if (data.type === "error") {
                setHistory((prev) => [
                  ...prev,
                  { role: "assistant", content: data.message ?? "Ocurrió un error." },
                ])
                setStreamingText("")
                streamingRef.current = ""
              }
            } catch {
              // chunk malformado
            }
          }
        }
      } catch (err) {
        console.error("[onboarding] error:", err)
        setHistory((prev) => [
          ...prev,
          { role: "assistant", content: "Tuve un problema. Intentá de nuevo." },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [router, update]
  )

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading || isDone) return

    const userMsg: Message = { role: "user", content: trimmed }
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setInput("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    sendToApi(newHistory)
  }, [input, isLoading, isDone, history, sendToApi])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const allMessages = [
    ...history,
    ...(streamingText ? [{ role: "assistant" as const, content: streamingText }] : []),
  ]

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <div className="h-9 w-9 rounded-xl bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--text))]">Configuración inicial</p>
            <p className="text-xs text-[hsl(var(--text-3))]">KITT te va a hacer algunas preguntas</p>
          </div>
          {isDone && (
            <div className="ml-auto flex items-center gap-2 text-xs text-emerald-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Redirigiendo al chat...
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {allMessages.length === 0 && !isLoading && (
            <div className="flex justify-start gap-2.5">
              <Avatar />
              <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-sm px-4 py-3">
                <LoadingDots />
              </div>
            </div>
          )}

          {allMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && <Avatar />}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[hsl(var(--accent))] text-white rounded-tr-sm"
                    : "bg-[hsl(var(--surface))] border border-[hsl(var(--border))] text-[hsl(var(--text))] rounded-tl-sm"
                }`}
              >
                {msg.content}
                {/* Cursor parpadeante en streaming */}
                {i === allMessages.length - 1 &&
                  msg.role === "assistant" &&
                  isLoading && (
                    <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-text-bottom" />
                  )}
              </div>
            </div>
          ))}

          {/* Loading dots cuando espera respuesta (sin streaming aún) */}
          {isLoading && !streamingText && allMessages[allMessages.length - 1]?.role === "user" && (
            <div className="flex justify-start gap-2.5">
              <Avatar />
              <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-sm px-4 py-3">
                <LoadingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <div className="flex-1 flex items-end gap-2 rounded-xl border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] px-3 py-2 focus-within:ring-2 focus-within:ring-[hsl(var(--accent))] focus-within:border-[hsl(var(--accent))] transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isDone ? "¡Listo! Redirigiendo..." : "Respondé acá..."
              }
              disabled={isLoading || isDone}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none max-h-[120px] min-h-[24px] leading-6 disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isDone}
            className="h-10 w-10 flex-shrink-0 rounded-xl bg-[hsl(var(--accent))] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Enviar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="hidden md:block text-center text-[10px] text-[hsl(var(--text-3))] mt-2">
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  )
}

function Avatar() {
  return (
    <div className="h-7 w-7 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0 mt-1">
      <span className="text-white text-xs font-bold">K</span>
    </div>
  )
}

function LoadingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:300ms]" />
    </div>
  )
}
