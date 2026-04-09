"use client"

import { useSession } from "next-auth/react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { StatusBadge } from "./StatusBadge"

interface MobileHeaderProps {
  waConnected?: boolean
  gmailConnected?: boolean
}

export function MobileHeader({
  waConnected = false,
  gmailConnected = false,
}: MobileHeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-[hsl(var(--accent))] flex items-center justify-center">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[hsl(var(--text))]">KITT</span>
          {/* Status dots compactos */}
          <div className="flex items-center gap-1.5">
            <StatusBadge connected={waConnected} />
            <StatusBadge connected={gmailConnected} />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {session?.user && (
          <div className="h-8 w-8 rounded-full bg-[hsl(var(--accent-soft))] flex items-center justify-center ml-1">
            <span className="text-[hsl(var(--accent))] text-xs font-semibold">
              {(session.user.name ?? session.user.email ?? "U")
                .charAt(0)
                .toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
