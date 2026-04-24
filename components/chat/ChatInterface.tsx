"use client"

import { useCallback, useRef } from "react"
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
    updateLastMessage,
    patchLastMessage,
    setArtifact,
    setConversationId,
    setLoading,
  } = useChatStore()

  const abortRef = useRef<AbortController | null>(null)
  const streamedTextRef = useRef("")

  const handleSend = useCallback(
    async (text: string) => {
      if (isLoading) return

      // Mensaje del usuario
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date(),
      }
      addMessage(userMsg)
      setLoading(true)

      // Placeholder del asistente (se rellena con el stream)
      addMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      })
      streamedTextRef.current = ""

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, conversationId }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: "Error desconocido" }))
          updateLastMessage(err.error ?? "Error al conectar con KITT.")
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue
            try {
              const data = JSON.parse(part.slice(6))

              if (data.type === "text") {
                streamedTextRef.current += data.text
                updateLastMessage(streamedTextRef.current)
              } else if (data.type === "artifact") {
                setArtifact(data.artifact)
              } else if (data.type === "pending_action") {
                patchLastMessage({
                  pendingActionId: data.pendingActionId,
                  metadata: {
                    actionType: data.actionType,
                    actionPayload: data.actionPayload,
                  },
                })
              } else if (data.type === "done") {
                if (data.conversationId && data.conversationId !== conversationId) {
                  setConversationId(data.conversationId)
                }
                if (!streamedTextRef.current) {
                  updateLastMessage("Procesé tu solicitud.")
                }
              } else if (data.type === "error") {
                updateLastMessage(data.message ?? "Error al procesar tu mensaje.")
              }
            } catch {
              // chunk malformado — ignorar
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (!streamedTextRef.current) {
            updateLastMessage("Respuesta cancelada.")
          }
        } else {
          console.error("[chat] error:", err)
          updateLastMessage("Tuve un problema procesando tu mensaje. Intentá de nuevo.")
        }
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [
      isLoading,
      conversationId,
      addMessage,
      updateLastMessage,
      patchLastMessage,
      setArtifact,
      setConversationId,
      setLoading,
    ]
  )

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return (
    <div className="flex h-full">
      {/* Chat principal */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onSuggestion={handleSend}
        />
        <ChatInput
          onSend={handleSend}
          onCancel={handleCancel}
          disabled={isLoading}
          isStreaming={isLoading}
        />
      </div>

      {/* Panel de artefacto */}
      {artifact && (
        <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
      )}
    </div>
  )
}
