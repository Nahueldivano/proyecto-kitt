"use client"

import { useRef, useState } from "react"
import type { InlineArtifact } from "@/lib/artifact-parser"

interface Props {
  artifact: InlineArtifact
}

export function ArtifactRenderer({ artifact }: Props) {
  const [expanded, setExpanded] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const slug = artifact.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "artefacto"

  const handleDownload = () => {
    let blob: Blob
    let ext = "html"

    if (artifact.type === "markdown") {
      blob = new Blob([artifact.code], { type: "text/markdown" })
      ext = "md"
    } else if (artifact.type === "react") {
      blob = new Blob([artifact.code], { type: "text/javascript" })
      ext = "jsx"
    } else if (artifact.type === "svg") {
      blob = new Blob([artifact.code], { type: "image/svg+xml" })
      ext = "svg"
    } else {
      blob = new Blob([buildSrcdoc(artifact)], { type: "text/html" })
      ext = "html"
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${slug}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print()
  }

  const isRenderable = artifact.type !== "react"

  return (
    <div className="mt-2 border border-[hsl(var(--border))] rounded-xl overflow-hidden bg-[hsl(var(--surface-2))]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{iconFor(artifact.type)}</span>
          <span className="text-sm font-medium text-[hsl(var(--text))] truncate">
            {artifact.title}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-3))] font-medium flex-shrink-0">
            {artifact.type}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <IconButton onClick={handleDownload} title="Descargar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </IconButton>
          {isRenderable && (
            <IconButton onClick={handlePrint} title="Imprimir / PDF">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </IconButton>
          )}
          <IconButton onClick={() => setExpanded((v) => !v)} title={expanded ? "Colapsar" : "Expandir"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {expanded ? (
                <polyline points="18 15 12 9 6 15" />
              ) : (
                <polyline points="6 9 12 15 18 9" />
              )}
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Body */}
      {expanded && isRenderable && (
        <iframe
          ref={iframeRef}
          srcDoc={buildSrcdoc(artifact)}
          className="w-full bg-white border-0"
          style={{ height: 480 }}
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          title={artifact.title}
        />
      )}
      {expanded && artifact.type === "react" && (
        <pre className="p-3 text-xs font-mono text-[hsl(var(--text))] overflow-auto max-h-[480px] whitespace-pre">
          <code>{artifact.code}</code>
        </pre>
      )}
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))] rounded transition-colors"
    >
      {children}
    </button>
  )
}

function iconFor(type: InlineArtifact["type"]): string {
  switch (type) {
    case "html":
      return "🖥️"
    case "react":
      return "⚛️"
    case "svg":
      return "🎨"
    case "markdown":
      return "📄"
    default:
      return "📦"
  }
}

function buildSrcdoc(artifact: InlineArtifact): string {
  const safeTitle = artifact.title.replace(/[<>&"]/g, "")

  if (artifact.type === "html") {
    const raw = artifact.code.trim()
    if (/^<(!doctype|html)\b/i.test(raw)) return raw
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:1rem;}</style></head><body class="bg-white text-slate-900">${raw}</body></html>`
  }

  if (artifact.type === "svg") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0;background:white;display:flex;align-items:center;justify-content:center;min-height:100vh;}svg{max-width:100%;max-height:100vh;}</style></head><body>${artifact.code}</body></html>`
  }

  if (artifact.type === "markdown") {
    const html = mdToHtml(artifact.code)
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:Georgia,serif;max-width:780px;margin:32px auto;padding:0 24px;color:#1a1a1a;line-height:1.65;}h1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:.3em;}h2{font-size:1.5em;margin-top:1.5em;}h3{font-size:1.2em;}code{background:#f4f4f5;padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace;font-size:.92em;}pre{background:#1e1e1e;color:#f5f5f5;padding:14px;border-radius:8px;overflow-x:auto;}pre code{background:transparent;color:inherit;padding:0;}table{border-collapse:collapse;width:100%;margin:1em 0;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;}th{background:#f9fafb;}ul,ol{padding-left:1.4em;}a{color:#2563eb;}</style></head><body>${html}</body></html>`
  }

  return ""
}

function mdToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)

  // Tablas markdown simples
  html = html.replace(/^\|(.+)\|\n\|([\s:|-]+)\|\n((?:\|.+\|\n?)+)/gm, (_m, header, _sep, rows) => {
    const ths = String(header)
      .split("|")
      .map((h) => h.trim())
      .filter(Boolean)
      .map((h) => `<th>${h}</th>`)
      .join("")
    const trs = String(rows)
      .trim()
      .split("\n")
      .map((row) => {
        const tds = row
          .split("|")
          .map((c) => c.trim())
          .filter((_, i, arr) => i > 0 && i < arr.length - 1)
          .map((c) => `<td>${c}</td>`)
          .join("")
        return `<tr>${tds}</tr>`
      })
      .join("")
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
  })

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (/^<(h\d|ul|ol|pre|table|blockquote)/.test(block.trim())) return block
      return `<p>${block.replace(/\n/g, "<br>")}</p>`
    })
    .join("\n")

  return html
}
