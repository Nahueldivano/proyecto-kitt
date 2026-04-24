import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const folders = await db.folder.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, position: true },
  })

  return NextResponse.json({ folders })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, color } = await req.json()
  if (!name || typeof name !== "string") return NextResponse.json({ error: "Nombre inválido" }, { status: 400 })

  const folder = await db.folder.create({
    data: { tenantId: session.user.tenantId, name: name.trim(), color: color ?? null },
    select: { id: true, name: true, color: true, position: true },
  })

  return NextResponse.json({ folder })
}
