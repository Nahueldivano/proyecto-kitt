"use client"

import { useEffect, useRef } from "react"
import type { ChatMessage } from "@/lib/store"
import { MessageBubble } from "./MessageBubble"
import { ThinkingIndicator } from "./ThinkingIndicator"

const SUGGESTIONS = [
  "¿Qué emails tengo sin responder?",
  "Resumime los mensajes de WhatsApp de hoy",
  "¿Hay algún tema urgente pendiente?",
  "Mostrá el último reporte",
]

interface MessageListProps {
  messages: ChatMessage[]
  isLoading?: boolean
  thinkingPhase?: string | null
  onSuggestion: (text: string) => void
}

export function MessageList({ messages, isLoading, thinkingPhase, onSuggestion }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isEmpty = messages.length === 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading, thinkingPhase])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {isEmpty && !isLoading ? (
          /* Empty state estilo Claude: ícono decorativo + texto serif grande */
          <div className="flex flex-col items-center justify-center min-h-[55vh] text-center px-2 select-none">
            {/* Ícono decorativo — asterisco/flor como Claude pero con K de KITT */}
            <div className="mb-6 relative">
              {/* Ícono decorativo: rayos/asterisco en color acento */}
              <svg
                width="56" height="56"
                viewBox="0 0 56 56"
                fill="none"
                className="text-[hsl(var(--accent))]"
                aria-hidden="true"
              >
                <circle cx="28" cy="28" r="6" fill="currentColor" opacity="0.9"/>
                <rect x="26" y="4" width="4" height="16" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="26" y="36" width="4" height="16" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="4" y="26" width="16" height="4" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="36" y="26" width="16" height="4" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="10.34" y="11.76" width="4" height="16" rx="2" fill="currentColor" opacity="0.5" transform="rotate(-45 10.34 11.76)"/>
                <rect x="29.17" y="30.59" width="4" height="16" rx="2" fill="currentColor" opacity="0.5" transform="rotate(-45 29.17 30.59)"/>
                <rect x="10.34" y="44.24" width="4" height="16" rx="2" fill="currentColor" opacity="0.5" transform="rotate(45 10.34 44.24)"/>
                <rect x="29.17" y="25.41" width="4" height="16" rx="2" fill="currentColor" opacity="0.5" transform="rotate(45 29.17 25.41)"/>
              </svg>
            </div>

            {/* Texto principal: serif grande, como Claude */}
            <h2 className="font-display text-[1.75rem] leading-tight font-bold text-[hsl(var(--text))] mb-2 max-w-[280px] md:text-3xl md:max-w-none">
              ¿En qué te puedo ayudar?
            </h2>
            <p className="text-sm text-[hsl(var(--text-3))] mb-8">
              Tu asistente empresarial
            </p>

            {/* Suggestion chips — en desktop se muestran, en mobile más compactos */}
            <div className="flex flex-wrap gap-2 justify-center max-w-sm md:max-w-xl">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSuggestion(suggestion)}
                  className="px-3.5 py-2 text-sm rounded-full border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] active:scale-95 transition-all touch-manipulation text-left"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Lista de mensajes */
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Indicador de thinking — mientras KITT ejecuta tools */}
            {isLoading && thinkingPhase && (
              <ThinkingIndicator phase={thinkingPhase} />
            )}

            {/* Puntos simples — solo cuando está streameando texto (no hay thinkingPhase) */}
            {isLoading && !thinkingPhase && messages[messages.length - 1]?.content === "" && (
              <div className="flex gap-2.5 items-start">
                <div className="h-7 w-7 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[hsl(var(--accent))] text-xs font-bold">K</span>
                </div>
                <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-3))] animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
