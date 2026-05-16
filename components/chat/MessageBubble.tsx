"use client"

import type { ChatMessage, Artifact } from "@/lib/store"
import { useChatStore } from "@/lib/store"
import { ApprovalCard } from "./ApprovalCard"
import { BatchApprovalCard } from "./BatchApprovalCard"
import { formatRelativeDate } from "@/lib/utils"
import { parseResponseWithArtifacts } from "@/lib/artifact-parser"
import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer"

interface MessageBubbleProps {
  message: ChatMessage
}

function ArtifactChip({ artifact }: { artifact: Artifact }) {
  const setArtifact = useChatStore((s) => s.setArtifact)

  const typeIcon: Record<Artifact["type"], React.ReactNode> = {
    document: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
    html: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    code: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    chart: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  }

  return (
    <button
      onClick={() => setArtifact(artifact)}
      className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border-2))] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface))] active:bg-[hsl(var(--surface))] hover:border-[hsl(var(--accent))] active:border-[hsl(var(--accent))] transition-colors text-left group touch-manipulation"
    >
      <span className="text-[hsl(var(--accent))]">{typeIcon[artifact.type]}</span>
      <span className="text-xs text-[hsl(var(--text-2))] group-hover:text-[hsl(var(--text))] truncate max-w-[200px]">
        {artifact.title}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[hsl(var(--text-3))] flex-shrink-0 ml-auto">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </button>
  )
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] md:max-w-[60%]">
          <div className="bg-[hsl(var(--accent))] text-white rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed shadow-sm">
            {message.content}
          </div>
          <p className="text-[9px] text-[hsl(var(--text-3))] mt-1 text-right tracking-wide">
            {formatRelativeDate(message.createdAt)}
          </p>
        </div>
      </div>
    )
  }

  // Mensaje de KITT — parseamos artefactos inline (formato XML <artifact>)
  const { text, artifacts } = parseResponseWithArtifacts(message.content)

  const pendingActionId = message.pendingActionId
  const metadata = message.metadata as {
    actionType?: string
    actionPayload?: Record<string, unknown>
    batchId?: string
    batchTitle?: string
    batchTasks?: Array<{ id: string; label: string; type: string; status: "pending"; payload?: Record<string, unknown> }>
    artifact?: Artifact
  } | undefined

  return (
    <div className="flex gap-3">
      {/* Avatar KITT */}
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(238,70%,50%)] flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
        <span className="text-white text-[11px] font-bold tracking-tight">K</span>
      </div>

      <div className="flex-1 max-w-[80%] md:max-w-[70%]">
        {text && (
          <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-md px-4 py-3 text-sm text-[hsl(var(--text))] leading-relaxed shadow-sm">
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {/* Artefactos inline (uno o varios por mensaje) */}
        {artifacts.map((art) => (
          <ArtifactRenderer key={art.id} artifact={art} />
        ))}

        {/* Chip para reabrir artefacto del panel lateral */}
        {metadata?.artifact && (
          <ArtifactChip artifact={metadata.artifact} />
        )}

        {/* Lote de tareas pendientes */}
        {metadata?.batchId && metadata.batchTasks && (
          <BatchApprovalCard
            batchId={metadata.batchId}
            title={metadata.batchTitle ?? "Acciones pendientes"}
            tasks={metadata.batchTasks}
          />
        )}

        {/* Tarjeta de aprobación si hay acción pendiente (acción individual) */}
        {!metadata?.batchId && pendingActionId && metadata?.actionType && (
          <ApprovalCard
            actionId={pendingActionId}
            type={metadata.actionType}
            payload={metadata.actionPayload ?? {}}
          />
        )}

        <p className="text-[9px] text-[hsl(var(--text-3))] mt-1 ml-1 tracking-wide">
          {formatRelativeDate(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
