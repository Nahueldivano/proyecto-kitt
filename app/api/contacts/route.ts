import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/contacts — lista todos los contactos del tenant
export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const contacts = await db.contact.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ isFavorite: "desc" }, { isGroup: "asc" }, { name: "asc" }],
  })
  return NextResponse.json({ contacts })
}

// POST /api/contacts — crear contacto
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { chatJid, name, notes, tags, syncEnabled, isGroup } = await req.json()
  if (!chatJid || !name) return NextResponse.json({ error: "chatJid y name son requeridos" }, { status: 400 })

  const phone = chatJid.replace(/@[^@]+$/, "")
  const contact = await db.contact.upsert({
    where: { tenantId_chatJid: { tenantId: session.user.tenantId, chatJid } },
    update: { name, notes, tags: tags ?? [], syncEnabled: syncEnabled ?? true },
    create: {
      tenantId: session.user.tenantId,
      chatJid,
      name,
      phone: isGroup ? null : phone,
      isGroup: isGroup ?? chatJid.endsWith("@g.us"),
      notes,
      tags: tags ?? [],
      syncEnabled: syncEnabled ?? true,
    },
  })
  return NextResponse.json({ contact })
}
