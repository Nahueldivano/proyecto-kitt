import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { listUnreadEmails, readEmail } from "@/lib/gmail"

// GET /api/gmail/db?max=N  → { emails: EmailSummary[] }
// GET /api/gmail/db?id=X   → { email: EmailFull }
// Live fetch desde Gmail API — sin almacenamiento local.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const max = Math.min(parseInt(searchParams.get("max") ?? "30"), 100)

  try {
    if (id) {
      const email = await readEmail(session.user.tenantId, id)
      return NextResponse.json({ email })
    }

    const emails = await listUnreadEmails(session.user.tenantId, max)
    return NextResponse.json({ emails })
  } catch (err) {
    console.error("[gmail/db]", err)
    return NextResponse.json({ emails: [], email: null, connected: false })
  }
}
