"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"
import { StatusBadge } from "./StatusBadge"
import { cn } from "@/lib/utils"

interface SidebarProps {
  waConnected?: boolean
  gmailConnected?: boolean
}

const navItems = [
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "Historial",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Configuración",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      </svg>
    ),
  },
]

export function Sidebar({ waConnected = false, gmailConnected = false }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside className="hidden md:flex flex-col w-56 border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))] h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="font-semibold text-[hsl(var(--text))]">KITT</span>
        </div>
        {/* Status dots */}
        <div className="flex items-center gap-3 mt-3">
          <StatusBadge connected={waConnected} label="WA" showLabel />
          <StatusBadge connected={gmailConnected} label="Gmail" showLabel />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium transition-colors",
                active
                  ? "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent))]"
                  : "text-[hsl(var(--text-2))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--text))]"
              )}
            >
              <span className={active ? "text-[hsl(var(--accent))]" : ""}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[hsl(var(--border))] space-y-2">
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors px-2 py-1"
          >
            Salir
          </button>
        </div>
        {session?.user && (
          <div className="px-1">
            <p className="text-xs font-medium text-[hsl(var(--text-2))] truncate">
              {session.user.name ?? session.user.email}
            </p>
            <p className="text-xs text-[hsl(var(--text-3))] truncate">
              {session.user.email}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
