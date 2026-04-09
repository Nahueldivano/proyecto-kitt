"use client"

import { useCallback } from "react"
import { useChatStore } from "@/lib/store"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { ArtifactPanel } from "./ArtifactPanel"
import type { ChatMessage } from "@/lib/store"

export function ChatInterface() {
  const {
    messages,
    artifact,
    conversationId,
    isLoading,
    addMessage,
    setArtifact,
    setConversationId,
    setLoading,
  } = useChatStore()

  const handleSend = useCallback(
    async (text: string) => {
      if (isLoading) return

      // Agregar mensaje del usuario inmediatamente
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date(),
      }
      addMessage(userMsg)
      setLoading(true)

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId,
          }),
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()

        // Actualizar conversationId si es nueva conversación
        if (data.conversationId && data.conversationId !== conversationId) {
          setConversationId(data.conversationId)
        }

        // Agregar respuesta de KITT
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message,
          pendingActionId: data.pendingActionId,
          metadata: {
            actionType: data.actionType,
            actionPayload: data.actionPayload,
          },
          createdAt: new Date(),
        }
        addMessage(assistantMsg)

        // Si hay artefacto, mostrarlo
        if (data.artifact) {
          setArtifact(data.artifact)
        }
      } catch (error) {
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Tuve un problema procesando tu mensaje. Intentá de nuevo.",
          createdAt: new Date(),
        }
        addMessage(errorMsg)
        console.error("[chat] error:", error)
      } finally {
        setLoading(false)
      }
    },
    [isLoading, conversationId, addMessage, setArtifact, setConversationId, setLoading]
  )

  return (
    <div className="flex h-full">
      {/* Chat principal */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onSuggestion={handleSend}
        />
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </div>

      {/* Panel de artefacto */}
      {artifact && (
        <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
      )}
    </div>
  )
}
