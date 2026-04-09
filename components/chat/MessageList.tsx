"use client"

import { useEffect, useRef } from "react"
import type { ChatMessage } from "@/lib/store"
import { MessageBubble } from "./MessageBubble"

const SUGGESTIONS = [
  "¿Qué emails tengo sin responder?",
  "Resumime los mensajes de WhatsApp de hoy",
  "¿Hay algún tema urgente pendiente?",
  "Mostrá el último reporte",
]

interface MessageListProps {
  messages: ChatMessage[]
  isLoading?: boolean
  onSuggestion: (text: string) => void
}

export function MessageList({ messages, isLoading, onSuggestion }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isEmpty = messages.length === 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {isEmpty && !isLoading ? (
          /* Estado vacío — bienvenida + suggestions */
          <div className="py-8 text-center space-y-6">
            <div>
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[hsl(var(--accent-soft))] mb-4">
                <span className="text-[hsl(var(--accent))] text-2xl font-bold">K</span>
              </div>
              <h2 className="text-lg font-semibold text-[hsl(var(--text))]">
                Hola, soy KITT
              </h2>
              <p className="text-sm text-[hsl(var(--text-3))] mt-1">
                Tu asistente empresarial. ¿En qué te puedo ayudar hoy?
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSuggestion(suggestion)}
                  className="px-3 py-2 text-sm rounded-full border border-[hsl(var(--border-2))] text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] transition-colors touch-manipulation text-left"
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

            {/* Indicador de carga */}
            {isLoading && (
              <div className="flex gap-2.5">
                <div className="h-7 w-7 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0 mt-1">
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
