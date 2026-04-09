import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getQRCode, getInstanceName } from "@/lib/evolution"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const tenantId = session.user.tenantId
    const result = await getQRCode(tenantId)

    if (!result) {
      return NextResponse.json({ error: "No se pudo obtener el QR" }, { status: 503 })
    }

    // Crear/actualizar registro de sesión
    await db.whatsappSession.upsert({
      where: { tenantId },
      update: { status: "connecting", instanceName: getInstanceName(tenantId) },
      create: {
        tenantId,
        status: "connecting",
        instanceName: getInstanceName(tenantId),
      },
    })

    return NextResponse.json({ qrcode: result.qrcode })
  } catch (error) {
    console.error("[whatsapp/qr] error:", error)
    return NextResponse.json({ error: "Error al obtener QR" }, { status: 500 })
  }
}
