import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/contacts/cleanup — elimina contactos sin nombre real
// (creados con solo número o JID como nombre)
export async function POST() {
  const session = await auth()
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = session.user.tenantId

  // Eliminar contactos cuyo nombre es solo dígitos o contiene @ (son JIDs, no nombres reales)
  const result = await db.$executeRawUnsafe(`
    DELETE FROM "Contact"
    WHERE "tenantId" = $1
      AND (
        "name" ~ '^[0-9]+$'
        OR "name" LIKE '%@%'
      )
  `, tenantId)

  return NextResponse.json({ ok: true, deleted: result })
}
