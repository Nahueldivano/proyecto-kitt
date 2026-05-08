import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileHeader } from "@/components/layout/MobileHeader"
import { AppShell } from "@/components/layout/AppShell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user?.tenantId) redirect("/login")

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

      {/* Shell client — gestiona el drawer mobile */}
      <AppShell waConnected={waConnected} gmailConnected={gmailConnected}>
        {children}
      </AppShell>
    </div>
  )
}
