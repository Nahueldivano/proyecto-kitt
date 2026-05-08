"use client"

import { useEffect, useCallback, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useChatStore } from "@/lib/store"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  title: string
  createdAt: string
}

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  waConnected?: boolean
  gmailConnected?: boolean
}

const NAV_ITEMS = [
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/history",
    label: "Historial",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
      </svg>
    ),
  },
  {
    href: "/whatsapp-db",
    label: "WhatsApp",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      </svg>
    ),
  },
]

export function MobileDrawer({ open, onClose, waConnected = false, gmailConnected = false }: MobileDrawerProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const reset = useChatStore((s) => s.reset)
  const setConversationId = useChatStore((s) => s.setConversationId)

  const [conversations, setConversations] = useState<Conversation[]>([])

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations")
      if (r.ok) {
        const d = await r.json()
        setConversations((d.conversations ?? []).slice(0, 8))
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (open) loadConversations()
  }, [open, loadConversations])

  // Cerrar con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  function handleNewChat() {
    reset()
    onClose()
  }

  function handleNavClick() {
    onClose()
  }

  function handleConvClick(id: string) {
    setConversationId(id)
    onClose()
  }

  const userInitial = (session?.user?.name ?? session?.user?.email ?? "U").charAt(0).toUpperCase()
  const userName = session?.user?.name ?? session?.user?.email ?? "Usuario"

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-50 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-[300px] flex flex-col",
          "bg-[hsl(var(--background))] pt-safe",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h1 className="text-3xl font-bold text-[hsl(var(--text))] tracking-tight">KITT</h1>
          <button
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center rounded-full text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            aria-label="Cerrar menú"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-3 py-2">

          {/* Nuevo chat */}
          <Link
            href="/chat"
            onClick={handleNewChat}
            className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent-soft))] transition-colors mb-1"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span className="text-base font-medium">Nuevo chat</span>
          </Link>

          {/* Nav principal */}
          <nav className="space-y-0.5 mb-4">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-3.5 rounded-xl transition-colors",
                    active
                      ? "bg-[hsl(var(--surface-2))] text-[hsl(var(--text))]"
                      : "text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
                  )}
                >
                  <span className={active ? "text-[hsl(var(--accent))]" : "text-[hsl(var(--text-3))]"}>
                    {item.icon}
                  </span>
                  <span className="text-base">{item.label}</span>

                  {/* Badges de estado para integraciones */}
                  {item.href === "/whatsapp-db" && (
                    <span className={cn(
                      "ml-auto h-2 w-2 rounded-full",
                      waConnected ? "bg-green-500" : "bg-[hsl(var(--border-2))]"
                    )} />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Recientes */}
          {conversations.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1.5 text-xs font-semibold text-[hsl(var(--text-3))] uppercase tracking-wider">
                Recientes
              </p>
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href="/chat"
                    onClick={() => handleConvClick(conv.id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))] transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span className="text-sm truncate">{conv.title ?? "Chat sin título"}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: usuario */}
        <div className="border-t border-[hsl(var(--border))] px-4 py-4 pb-safe">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[hsl(var(--accent))] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-semibold">{userInitial}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[hsl(var(--text))] truncate">{userName}</p>
              {session?.user?.email && session.user.name && (
                <p className="text-xs text-[hsl(var(--text-3))] truncate">{session.user.email}</p>
              )}
            </div>
            <button
              onClick={() => { signOut({ callbackUrl: "/login" }); onClose() }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-[hsl(var(--text-3))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--destructive))] transition-colors"
              aria-label="Cerrar sesión"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
