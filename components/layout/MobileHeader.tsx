"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { StatusBadge } from "./StatusBadge"
import { useChatStore } from "@/lib/store"

interface MobileHeaderProps {
  waConnected?: boolean
  gmailConnected?: boolean
}

export function MobileHeader({
  waConnected = false,
  gmailConnected = false,
}: MobileHeaderProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const reset = useChatStore((s) => s.reset)
  const isChat = pathname === "/chat"

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] pt-safe">
      {/* Logo + status */}
      <div className="flex items-center gap-2">
        <Link href="/chat" onClick={reset}>
          <Image src="/kitt-logo.png" alt="KITT" width={40} height={32} className="object-contain" />
        </Link>
        <div className="flex items-center gap-1">
          <StatusBadge connected={waConnected} />
          <StatusBadge connected={gmailConnected} />
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1">
        {/* Botón nuevo chat — solo visible en /chat */}
        {isChat && (
          <button
            onClick={reset}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-2))] transition-colors"
            aria-label="Nuevo chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        )}
        <ThemeToggle />
        {session?.user && (
          <Link href="/settings" className="h-8 w-8 rounded-full bg-[hsl(var(--accent-soft))] flex items-center justify-center ml-0.5">
            <span className="text-[hsl(var(--accent))] text-xs font-semibold">
              {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
            </span>
          </Link>
        )}
      </div>
    </header>
  )
}
