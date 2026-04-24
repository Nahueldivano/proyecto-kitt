"use client"

import { createContext, useContext, useState, useCallback, useRef } from "react"

interface ToastItem {
  id: number
  message: string
  type: "success" | "error" | "info"
}

interface ToastContextValue {
  toast: (opts: { message: string; type?: "success" | "error" | "info" }) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
}

const COLORS = {
  success: { bg: "hsl(var(--success) / 0.12)", border: "hsl(var(--success) / 0.3)", color: "hsl(var(--success))" },
  error:   { bg: "hsl(var(--destructive) / 0.12)", border: "hsl(var(--destructive) / 0.3)", color: "hsl(var(--destructive))" },
  info:    { bg: "hsl(var(--accent-soft))", border: "hsl(var(--accent) / 0.3)", color: "hsl(var(--accent))" },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const toast = useCallback(({ message, type = "info" }: { message: string; type?: ToastItem["type"] }) => {
    const id = ++counterRef.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom right, fixed */}
      <div className="fixed bottom-6 right-6 z-[999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const c = COLORS[t.type]
          return (
            <div
              key={t.id}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium animate-slide-down pointer-events-auto"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.color,
                backdropFilter: "blur(12px)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                minWidth: "200px",
              }}
            >
              <span className="flex-shrink-0">{ICONS[t.type]}</span>
              <span style={{ color: "hsl(var(--text))" }}>{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
