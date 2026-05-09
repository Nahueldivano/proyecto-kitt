"use client"

import { useEffect, useState } from "react"

interface ThinkingIndicatorProps {
  phase: string
}

export function ThinkingIndicator({ phase }: ThinkingIndicatorProps) {
  // Anima la entrada de cada nueva frase con fade
  const [displayed, setDisplayed] = useState(phase)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (phase === displayed) return
    // Fade out → swap texto → fade in
    setVisible(false)
    const t = setTimeout(() => {
      setDisplayed(phase)
      setVisible(true)
    }, 180)
    return () => clearTimeout(t)
  }, [phase, displayed])

  return (
    <div className="flex gap-2.5 items-start">
      {/* Avatar K con pulso */}
      <div className="relative h-7 w-7 rounded-full bg-[hsl(var(--accent-soft))] flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[hsl(var(--accent))] text-xs font-bold">K</span>
        {/* Anillo pulsante */}
        <span className="absolute inset-0 rounded-full border border-[hsl(var(--accent))] opacity-60 animate-[ping_1.4s_ease-in-out_infinite]" />
      </div>

      {/* Burbuja de pensamiento */}
      <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-3 min-w-[180px]">
        {/* Puntos animados */}
        <div className="flex gap-1 items-center shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))] animate-bounce [animation-delay:0ms] opacity-80" />
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))] animate-bounce [animation-delay:160ms] opacity-80" />
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))] animate-bounce [animation-delay:320ms] opacity-80" />
        </div>

        {/* Frase con transición fade */}
        <span
          className="text-xs text-[hsl(var(--text-3))] transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {displayed}
        </span>
      </div>
    </div>
  )
}
