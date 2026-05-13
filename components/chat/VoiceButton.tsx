"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

type State = "idle" | "recording" | "processing"

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [state, setState] = useState<State>("idle")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const pressedRef = useRef(false)

  // Limpiar si el componente se desmonta mientras graba
  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  const startRecording = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (disabled || pressedRef.current) return
    pressedRef.current = true

    if (typeof window === "undefined") return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition
    if (!SpeechRecognitionAPI) {
      alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari.")
      pressedRef.current = false
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionAPI() as any
    recognition.lang = "es-ES"
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false

    recognition.onstart = () => setState("recording")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript as string
      if (transcript?.trim()) {
        setState("processing")
        onTranscript(transcript.trim())
        // Pequeño delay para que el usuario vea "procesando" antes de volver a idle
        setTimeout(() => setState("idle"), 600)
      } else {
        setState("idle")
      }
    }

    recognition.onerror = () => {
      setState("idle")
      pressedRef.current = false
    }

    recognition.onend = () => {
      pressedRef.current = false
      // Si termina sin resultado, volver a idle
      setState((prev) => prev === "recording" ? "idle" : prev)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [disabled, onTranscript])

  const stopRecording = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!pressedRef.current) return
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  const isRecording = state === "recording"
  const isProcessing = state === "processing"

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded-full transition-all duration-150 touch-manipulation flex-shrink-0 select-none",
        isRecording && "bg-red-500 text-white scale-125 shadow-lg shadow-red-500/30",
        isProcessing && "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))] scale-110",
        !isRecording && !isProcessing && "text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]",
        disabled && "opacity-40 pointer-events-none"
      )}
      aria-label={
        isRecording ? "Grabando — suelta para enviar" :
        isProcessing ? "Procesando..." :
        "Mantén presionado para hablar"
      }
    >
      {isRecording ? (
        /* Ondas animadas mientras graba — como WhatsApp */
        <span className="relative flex items-center justify-center">
          <span className="absolute h-8 w-8 rounded-full bg-red-400 animate-ping opacity-40" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </span>
      ) : isProcessing ? (
        /* Spinner mientras carga */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className="animate-spin" strokeLinecap="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      ) : (
        /* Ícono micrófono */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      )}
    </button>
  )
}
