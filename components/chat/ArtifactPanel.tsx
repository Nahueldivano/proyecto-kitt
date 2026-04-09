"use client"

import type { Artifact } from "@/lib/store"
import { Button } from "@/components/ui/button"

interface ArtifactPanelProps {
  artifact: Artifact
  onClose: () => void
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const handleEmailSend = async () => {
    try {
      const res = await fetch("/api/artifact/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: artifact.content, title: artifact.title }),
      })
      if (res.ok) {
        alert("Documento enviado por email.")
      }
    } catch {
      alert("Error al enviar el email.")
    }
  }

  const renderContent = () => {
    switch (artifact.type) {
      case "html":
        return (
          <iframe
            srcDoc={artifact.content}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title={artifact.title}
          />
        )

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
      {/* Desktop: panel lateral */}
      <div className="hidden md:flex flex-col w-[420px] border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
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
