"use client"

import { usePathname } from "next/navigation"
import { useChatStore } from "@/lib/store"

interface MobileHeaderProps {
  waConnected?: boolean
  gmailConnected?: boolean
  onMenuOpen: () => void
}

const ROUTE_TITLES: Record<string, string> = {
  "/chat": "KITT",
  "/history": "Historial",
  "/whatsapp-db": "WhatsApp",
  "/contacts": "Contactos",
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
    // h-14 + pt-safe = header que respeta el notch/Dynamic Island en iOS
    <header className="md:hidden flex items-center justify-between px-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] pt-safe shrink-0" style={{ minHeight: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}>
      {/* Menú — 44×44px mínimo */}
      <button
        onClick={onMenuOpen}
        className="h-11 w-11 flex items-center justify-center rounded-full text-[hsl(var(--text-2))] active:bg-[hsl(var(--surface))] transition-colors touch-manipulation"
        aria-label="Abrir menú"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Título centrado */}
      <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-[hsl(var(--text))] pointer-events-none">
        {title}
      </span>

      {/* Acción derecha — 44×44px */}
      {isChat ? (
        <button
          onClick={reset}
          className="h-11 w-11 flex items-center justify-center rounded-full text-[hsl(var(--text-2))] active:bg-[hsl(var(--surface))] transition-colors touch-manipulation"
          aria-label="Nuevo chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      ) : (
        <div className="w-11" />
      )}
    </header>
  )
}
