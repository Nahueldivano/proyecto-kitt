import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await db.gmailConnection.deleteMany({
      where: { tenantId: session.user.tenantId },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[email/disconnect] error:", error)
    return NextResponse.json({ error: "Error al desconectar Gmail" }, { status: 500 })
  }
}
