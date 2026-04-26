"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  type?: "text" | "artifact"
  metadata?: Record<string, unknown>
  pendingActionId?: string
  createdAt: Date
}

export interface Artifact {
  type: "document" | "html" | "chart" | "code"
  title: string
  content: string
  language?: string
}

export interface AttachedFile {
  name: string
  type: string
  content: string // texto extraído o base64 para imágenes
  size: number
}

interface ChatStore {
  messages: ChatMessage[]
  artifact: Artifact | null
  conversationId: string | null
  isLoading: boolean
  selectedModel: string
  webSearchEnabled: boolean
  attachedFiles: AttachedFile[]

  addMessage: (msg: ChatMessage) => void
  updateLastMessage: (content: string) => void
  patchLastMessage: (patch: Partial<ChatMessage>) => void
  setArtifact: (artifact: Artifact | null) => void
  setConversationId: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setSelectedModel: (model: string) => void
  toggleWebSearch: () => void
  addAttachedFile: (file: AttachedFile) => void
  removeAttachedFile: (name: string) => void
  clearAttachedFiles: () => void
  reset: () => void
}

const DEFAULT_MODEL = "claude-opus-4-7"

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [],
      artifact: null,
      conversationId: null,
      isLoading: false,
      selectedModel: DEFAULT_MODEL,
      webSearchEnabled: false,
      attachedFiles: [],

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      updateLastMessage: (content) =>
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            messages[messages.length - 1] = { ...messages[messages.length - 1], content }
          }
          return { messages }
        }),

      patchLastMessage: (patch) =>
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            messages[messages.length - 1] = { ...messages[messages.length - 1], ...patch }
          }
          return { messages }
        }),

      setArtifact: (artifact) => set({ artifact }),
      setConversationId: (conversationId) => set({ conversationId }),
      setLoading: (isLoading) => set({ isLoading }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      toggleWebSearch: () => set((state) => ({ webSearchEnabled: !state.webSearchEnabled })),
      addAttachedFile: (file) =>
        set((state) => ({ attachedFiles: [...state.attachedFiles, file] })),
      removeAttachedFile: (name) =>
        set((state) => ({ attachedFiles: state.attachedFiles.filter((f) => f.name !== name) })),
      clearAttachedFiles: () => set({ attachedFiles: [] }),

      reset: () =>
        set({ messages: [], artifact: null, conversationId: null, isLoading: false, attachedFiles: [] }),
    }),
    {
      name: "kitt-chat-prefs",
      partialize: (state) => ({ selectedModel: state.selectedModel, webSearchEnabled: state.webSearchEnabled }),
    }
  )
)
