import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/contacts/export — descarga CSV con todos los contactos
export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const contacts = await db.contact.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isGroup: "asc" }, { name: "asc" }],
  })

  const header = "JID,Nombre,Teléfono,Grupo,Sync,Notas,Tags"
  const rows = contacts.map((c) => [
    c.chatJid,
    `"${(c.name ?? "").replace(/"/g, '""')}"`,
    c.phone ?? "",
    c.isGroup ? "Sí" : "No",
    c.syncEnabled ? "Sí" : "No",
    `"${(c.notes ?? "").replace(/"/g, '""')}"`,
    `"${(c.tags ?? []).join(";")}"`,
  ].join(","))

  const csv = [header, ...rows].join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contactos-kitt-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  })
}
