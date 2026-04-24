import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folders = await (db as any).folder.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json({ folders })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = await req.json()
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folder = await (db as any).folder.create({
    data: { tenantId: session.user.tenantId, name: name.trim() },
  })

  return NextResponse.json({ folder })
}
