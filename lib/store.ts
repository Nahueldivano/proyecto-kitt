"use client"

import { create } from "zustand"

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
  language?: string // para type "code"
}

interface ChatStore {
  messages: ChatMessage[]
  artifact: Artifact | null
  conversationId: string | null
  isLoading: boolean

  addMessage: (msg: ChatMessage) => void
  updateLastMessage: (content: string) => void
  patchLastMessage: (patch: Partial<ChatMessage>) => void
  setArtifact: (artifact: Artifact | null) => void
  setConversationId: (id: string) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  artifact: null,
  conversationId: null,
  isLoading: false,

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
        }
      }
      return { messages }
    }),

  patchLastMessage: (patch) =>
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          ...patch,
        }
      }
      return { messages }
    }),

  setArtifact: (artifact) => set({ artifact }),

  setConversationId: (conversationId) => set({ conversationId }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () =>
    set({ messages: [], artifact: null, conversationId: null, isLoading: false }),
}))
