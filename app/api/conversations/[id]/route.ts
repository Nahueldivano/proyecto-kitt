import { auth } from "@/auth"
import { NextRequest } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const { id } = await params

  const conversation = await db.conversation.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })

  if (!conversation) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }

  return Response.json({ messages: conversation.messages })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const { title, folderId } = body as { title?: string; folderId?: string | null }

  const conversation = await db.conversation.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!conversation) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (title !== undefined && typeof title === "string") updateData.title = title.trim()
  if (folderId !== undefined) updateData.folderId = folderId

  if (Object.keys(updateData).length === 0) {
    return new Response(JSON.stringify({ error: "Sin cambios" }), { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.conversation as any).update({ where: { id }, data: updateData })
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const { id } = await params

  const conversation = await db.conversation.findFirst({
    where: { id, tenantId: session.user.tenantId },
  })
  if (!conversation) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
  }

  await db.conversation.delete({ where: { id } })
  return Response.json({ ok: true })
}
