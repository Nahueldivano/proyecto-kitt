"use client"

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const startRecording = useCallback(() => {
    if (typeof window === "undefined") return

    // Web Speech API — nativa en Chrome y Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition

    if (!SpeechRecognitionAPI) {
      alert("Tu navegador no soporta reconocimiento de voz. Usá Chrome o Safari.")
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionAPI() as any
    recognition.lang = "es-AR"
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string
      onTranscript(transcript)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }, [onTranscript])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }, [])

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded-[var(--radius)] transition-all touch-manipulation flex-shrink-0",
        isRecording
          ? "bg-[hsl(var(--destructive))] text-white scale-110"
          : "text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]",
        disabled && "opacity-40 pointer-events-none"
      )}
      aria-label={isRecording ? "Grabando... soltá para terminar" : "Mantené presionado para hablar"}
      title={isRecording ? "Grabando..." : "Mantené presionado para hablar"}
    >
      {isRecording ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      )}
    </button>
  )
}
