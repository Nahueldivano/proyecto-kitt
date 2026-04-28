"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Artifact } from "@/lib/store"
import { Button } from "@/components/ui/button"

interface ArtifactPanelProps {
  artifact: Artifact
  onClose: () => void
}

const MIN_WIDTH = 360
const MAX_WIDTH_OFFSET = 320 // dejar al menos este ancho para el chat
const DEFAULT_WIDTH = 460
const STORAGE_KEY = "kitt-artifact-panel-width"

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH)
  const [resizing, setResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Cargar ancho persistido
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const n = parseInt(stored, 10)
      if (!Number.isNaN(n)) setWidth(clampWidth(n))
    }
  }, [])

  const clampWidth = (val: number): number => {
    const max = typeof window !== "undefined"
      ? Math.max(MIN_WIDTH, window.innerWidth - MAX_WIDTH_OFFSET)
      : 1200
    return Math.min(Math.max(val, MIN_WIDTH), max)
  }

  // Drag para redimensionar
  useEffect(() => {
    if (!resizing) return

    const onMove = (e: MouseEvent) => {
      e.preventDefault()
      const next = clampWidth(window.innerWidth - e.clientX)
      setWidth(next)
    }
    const onUp = () => {
      setResizing(false)
      window.localStorage.setItem(STORAGE_KEY, String(width))
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing])

  // Guardar ancho cuando cambia (después de soltar)
  useEffect(() => {
    if (!resizing && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(width))
    }
  }, [width, resizing])

  // Recortar si la ventana se hace muy chica
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const handleEmailSend = async () => {
    try {
      const res = await fetch("/api/artifact/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: artifact.content, title: artifact.title }),
      })
      if (res.ok) alert("Documento enviado por email.")
    } catch {
      alert("Error al enviar el email.")
    }
  }

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
  }, [])

  const renderContent = () => {
    switch (artifact.type) {
      case "html": {
        const raw = artifact.content.trim()
        const isFullDoc = /^<(!doctype|html)\b/i.test(raw)
        const srcDoc = isFullDoc
          ? raw
          : `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${artifact.title.replace(/[<>]/g, "")}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:1rem;}</style>
</head>
<body class="bg-white text-slate-900">
${raw}
</body>
</html>`
        return (
          <iframe
            srcDoc={srcDoc}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups"
            title={artifact.title}
          />
        )
      }

      case "code":
        return (
          <pre className="p-4 text-sm font-mono text-[hsl(var(--text))] overflow-auto h-full whitespace-pre-wrap">
            <code>{artifact.content}</code>
          </pre>
        )

      case "document":
        return (
          <div className="p-6 prose prose-sm max-w-none overflow-auto h-full">
            <div className="whitespace-pre-wrap text-sm text-[hsl(var(--text))] leading-relaxed">
              {artifact.content}
            </div>
          </div>
        )

      case "chart":
        return (
          <div className="p-4 h-full overflow-auto">
            <div
              className="text-sm text-[hsl(var(--text))]"
              dangerouslySetInnerHTML={{ __html: artifact.content }}
            />
          </div>
        )

      default:
        return (
          <div className="p-4 text-sm text-[hsl(var(--text-2))]">
            {artifact.content}
          </div>
        )
    }
  }

  return (
    <>
      {/* Desktop: panel lateral redimensionable */}
      <div
        ref={panelRef}
        className="hidden md:flex flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))] relative flex-shrink-0"
        style={{ width: `${width}px` }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={startResize}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group hover:bg-[hsl(var(--accent))] transition-colors ${resizing ? "bg-[hsl(var(--accent))]" : ""}`}
          title="Arrastrá para redimensionar"
        >
          <div className="absolute inset-y-0 -left-1 w-3" />
        </div>

        <ArtifactHeader
          artifact={artifact}
          onClose={onClose}
          onEmailSend={handleEmailSend}
        />
        <div className="flex-1 overflow-hidden">{renderContent()}</div>
      </div>

      {/* Mobile: fullscreen overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[hsl(var(--surface))]">
        <ArtifactHeader
          artifact={artifact}
          onClose={onClose}
          onEmailSend={handleEmailSend}
        />
        <div className="flex-1 overflow-hidden">{renderContent()}</div>
      </div>
    </>
  )
}

function ArtifactHeader({
  artifact,
  onClose,
  onEmailSend,
}: {
  artifact: Artifact
  onClose: () => void
  onEmailSend: () => void
}) {
  const typeLabel: Record<Artifact["type"], string> = {
    document: "Documento",
    html: "Página web",
    chart: "Gráfico",
    code: "Código",
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
      <div className="flex-1 min-w-0">
        <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--text-3))] font-medium">
          {typeLabel[artifact.type]}
        </span>
        <p className="text-sm font-medium text-[hsl(var(--text))] truncate">
          {artifact.title}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onEmailSend}
        className="text-xs hidden md:flex"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Enviar por email
      </Button>

      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </Button>
    </div>
  )
}
