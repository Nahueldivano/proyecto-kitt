import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { MobileNav } from "@/components/layout/MobileNav"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect("/login")

  // Leer estado de conexiones para los status badges
  const [wa, gmail] = await Promise.all([
    db.whatsappSession.findUnique({
      where: { tenantId: session.user.tenantId },
      select: { status: true },
    }),
    db.gmailConnection.findUnique({
      where: { tenantId: session.user.tenantId },
      select: { id: true },
    }),
  ])

  const waConnected = wa?.status === "connected"
  const gmailConnected = !!gmail

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-[hsl(var(--background))]">
      {/* Sidebar — solo desktop */}
      <Sidebar waConnected={waConnected} gmailConnected={gmailConnected} />

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header mobile */}
        <MobileHeader waConnected={waConnected} gmailConnected={gmailConnected} />

        {/* Contenido — en mobile deja espacio para el nav bottom fijo */}
        <main className="flex-1 overflow-hidden pb-mobile-nav md:pb-0">
          {children}
        </main>

        {/* Nav mobile */}
        <MobileNav />
      </div>
    </div>
  )
}
