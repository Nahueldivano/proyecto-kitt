"use client"

import { usePathname } from "next/navigation"
import { useChatStore } from "@/lib/store"
import { cn } from "@/lib/utils"

interface MobileHeaderProps {
  waConnected?: boolean
  gmailConnected?: boolean
  onMenuOpen: () => void
}

const ROUTE_TITLES: Record<string, string> = {
  "/chat": "KITT",
  "/history": "Historial",
  "/whatsapp-db": "WhatsApp",
  "/settings": "Configuración",
  "/reports": "Reportes",
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  const pathname = usePathname()
  const reset = useChatStore((s) => s.reset)

  const title = Object.entries(ROUTE_TITLES).find(([route]) =>
    pathname.startsWith(route)
  )?.[1] ?? "KITT"

  const isChat = pathname.startsWith("/chat")

  return (
    <header className="md:hidden flex items-center justify-between px-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] pt-safe h-14 shrink-0">
      {/* Botón menú hamburger */}
      <button
        onClick={onMenuOpen}
        className="h-10 w-10 flex items-center justify-center rounded-full text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface))] transition-colors -ml-1"
        aria-label="Abrir menú"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Título centrado */}
      <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-[hsl(var(--text))]">
        {title}
      </span>

      {/* Acción derecha: nuevo chat (solo en /chat) */}
      {isChat ? (
        <button
          onClick={reset}
          className="h-10 w-10 flex items-center justify-center rounded-full text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface))] transition-colors -mr-1"
          aria-label="Nuevo chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      ) : (
        <div className="w-10" />
      )}
    </header>
  )
}
