"use client"

import { useCallback, useRef, useEffect } from "react"
import { useChatStore } from "@/lib/store"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { ArtifactPanel } from "./ArtifactPanel"
import type { ChatMessage } from "@/lib/store"

export function ChatInterface() {
  const {
    messages, artifact, conversationId, isLoading,
    selectedModel, webSearchEnabled, attachedFiles, clearAttachedFiles,
    addMessage, updateLastMessage, patchLastMessage,
    setArtifact, setConversationId, setLoading,
  } = useChatStore()

  const abortRef = useRef<AbortController | null>(null)
  const streamedTextRef = useRef("")

  // Si hay un conversationId en el store, cargar mensajes al montar
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      fetch(`/api/conversations/${conversationId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.messages) {
            for (const m of d.messages) {
              addMessage({
                id: m.id,
                role: m.role,
                content: m.content,
                type: m.type,
                createdAt: new Date(m.createdAt),
              })
            }
          }
        })
        .catch(() => {})
    }
  // Solo al montar o cambiar conversationId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const handleSend = useCallback(
    async (text: string) => {
      if (isLoading) return

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text + (attachedFiles.length > 0 ? ` [${attachedFiles.map(f => f.name).join(", ")}]` : ""),
        createdAt: new Date(),
      }
      addMessage(userMsg)
      setLoading(true)

      addMessage({ id: `assistant-${Date.now()}`, role: "assistant", content: "", createdAt: new Date() })
      streamedTextRef.current = ""

      const controller = new AbortController()
      abortRef.current = controller

      // Archivos: imágenes como base64, texto como content
      const fileContents = attachedFiles.map((f) => ({
        name: f.name,
        type: f.type,
        content: f.content,
      }))
      clearAttachedFiles()

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId,
            model: selectedModel,
            webSearch: webSearchEnabled,
            fileContents: fileContents.length > 0 ? fileContents : undefined,
          }),
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
                patchLastMessage({ pendingActionId: data.pendingActionId, metadata: { actionType: data.actionType, actionPayload: data.actionPayload } })
              } else if (data.type === "done") {
                if (data.conversationId && data.conversationId !== conversationId) setConversationId(data.conversationId)
                if (!streamedTextRef.current) updateLastMessage("Procesé tu solicitud.")
              } else if (data.type === "error") {
                updateLastMessage(data.message ?? "Error al procesar tu mensaje.")
              }
            } catch { /* chunk malformado */ }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (!streamedTextRef.current) updateLastMessage("Respuesta cancelada.")
        } else {
          updateLastMessage("Tuve un problema procesando tu mensaje. Intentá de nuevo.")
        }
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [
      isLoading, conversationId, selectedModel, webSearchEnabled, attachedFiles,
      addMessage, updateLastMessage, patchLastMessage, setArtifact,
      setConversationId, setLoading, clearAttachedFiles,
    ]
  )

  const handleCancel = useCallback(() => { abortRef.current?.abort() }, [])

  const handleArtifactMode = useCallback(() => {
    handleSend("Creá un documento en blanco para que pueda escribir")
  }, [handleSend])

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <MessageList messages={messages} isLoading={isLoading} onSuggestion={handleSend} />
        <ChatInput
          onSend={handleSend}
          onCancel={handleCancel}
          onArtifactMode={handleArtifactMode}
          disabled={isLoading}
          isStreaming={isLoading}
        />
      </div>
      {artifact && <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />}
    </div>
  )
}
