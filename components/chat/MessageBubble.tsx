import type { ChatMessage } from "@/lib/store"
import { ApprovalCard } from "./ApprovalCard"
import { BatchApprovalCard } from "./BatchApprovalCard"
import { formatRelativeDate } from "@/lib/utils"
import { parseResponseWithArtifacts } from "@/lib/artifact-parser"
import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer"

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] md:max-w-[60%]">
          <div className="bg-[hsl(var(--accent))] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
            {message.content}
          </div>
          <p className="text-[10px] text-[hsl(var(--text-3))] mt-1 text-right">
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
    batchTasks?: Array<{ id: string; label: string; type: string; status: "pending" }>
  } | undefined

  return (
    <div className="flex gap-2.5">
      {/* Avatar KITT */}
      <div className="h-7 w-7 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0 mt-1">
        <span className="text-[hsl(var(--accent))] text-xs font-bold">K</span>
      </div>

      <div className="flex-1 max-w-[80%] md:max-w-[70%]">
        {text && (
          <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-[hsl(var(--text))]">
            <p className="whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {/* Artefactos inline (uno o varios por mensaje) */}
        {artifacts.map((art) => (
          <ArtifactRenderer key={art.id} artifact={art} />
        ))}

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

        <p className="text-[10px] text-[hsl(var(--text-3))] mt-1 ml-1">
          {formatRelativeDate(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
