import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name } = await req.json()
  if (!name || typeof name !== "string") return NextResponse.json({ error: "Nombre inválido" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folder = await (db as any).folder.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!folder) return NextResponse.json({ error: "No encontrada" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).folder.update({ where: { id }, data: { name: name.trim() } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folder = await (db as any).folder.findFirst({ where: { id, tenantId: session.user.tenantId } })
  if (!folder) return NextResponse.json({ error: "No encontrada" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).folder.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
