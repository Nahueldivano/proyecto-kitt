import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const tenantId = session.user.tenantId

    const action = await db.pendingAction.findUnique({ where: { id } })

    if (!action) {
      return NextResponse.json({ error: "Acción no encontrada" }, { status: 404 })
    }

    if (action.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (action.status !== "pending") {
      return NextResponse.json(
        { error: "La acción ya fue procesada" },
        { status: 409 }
      )
    }

    await db.pendingAction.update({
      where: { id },
      data: { status: "rejected" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[actions/reject] error:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
