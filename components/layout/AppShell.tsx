"use client"

import { useState } from "react"
import { MobileHeader } from "./MobileHeader"
import { MobileDrawer } from "./MobileDrawer"

interface AppShellProps {
  waConnected?: boolean
  gmailConnected?: boolean
  children: React.ReactNode
}

export function AppShell({ waConnected = false, gmailConnected = false, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header mobile */}
      <MobileHeader
        waConnected={waConnected}
        gmailConnected={gmailConnected}
        onMenuOpen={() => setDrawerOpen(true)}
      />

      {/* Drawer mobile */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        waConnected={waConnected}
        gmailConnected={gmailConnected}
      />

      {/* Contenido */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
