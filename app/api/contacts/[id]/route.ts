import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// PATCH /api/contacts/[id] — editar contacto
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact || contact.tenantId !== session.user.tenantId)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const body = await req.json()
  const allowed = ["name", "notes", "tags", "syncEnabled", "isFavorite"] as const
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k]
  }

  const updated = await db.contact.update({ where: { id }, data })
  return NextResponse.json({ contact: updated })
}

// DELETE /api/contacts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const contact = await db.contact.findUnique({ where: { id } })
  if (!contact || contact.tenantId !== session.user.tenantId)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  await db.contact.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
