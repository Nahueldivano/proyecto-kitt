"use client"

import { useState, useRef, KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { VoiceButton } from "./VoiceButton"

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Escribí un mensaje a KITT...",
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function handleVoiceTranscript(text: string) {
    setValue((prev) => (prev ? `${prev} ${text}` : text))
    textareaRef.current?.focus()
  }

  return (
    <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        {/* Textarea */}
        <div className="flex-1 flex items-end gap-2 rounded-xl border border-[hsl(var(--border-2))] bg-[hsl(var(--background))] px-3 py-2 focus-within:ring-2 focus-within:ring-[hsl(var(--accent))] focus-within:border-[hsl(var(--accent))] transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none max-h-40 min-h-[24px] leading-6 disabled:opacity-50"
          />
          <VoiceButton onTranscript={handleVoiceTranscript} disabled={disabled} />
        </div>

        {/* Send button — más grande en mobile */}
        <Button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          size="icon"
          className="h-10 w-10 md:h-9 md:w-9 flex-shrink-0 rounded-xl"
          aria-label="Enviar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Button>
      </div>

      {/* Hint "Enter para enviar" — solo desktop */}
      <p className="hidden md:block text-center text-[10px] text-[hsl(var(--text-3))] mt-2">
        Enter para enviar · Shift+Enter para nueva línea
      </p>
    </div>
  )
}
