import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { name, color } = await req.json()

  const folder = await db.folder.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await db.folder.update({
    where: { id },
    data: {
      ...(name && typeof name === "string" ? { name: name.trim() } : {}),
      ...(color !== undefined ? { color } : {}),
    },
    select: { id: true, name: true, color: true },
  })

  return NextResponse.json({ folder: updated })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const folder = await db.folder.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Conversations get folderId = null automatically (set null on delete in schema)
  await db.folder.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
