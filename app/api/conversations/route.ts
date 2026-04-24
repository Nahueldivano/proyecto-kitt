import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversations = await (db.conversation as any).findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 150,
    select: {
      id: true,
      title: true,
      folderId: true,
      createdAt: true,
      messages: {
        where: { role: "user" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { content: true },
      },
    },
  })

  return Response.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations: conversations.map((c: any) => ({
      id: c.id,
      title: c.title ?? (c.messages[0]?.content ?? "Conversación").replace(/\n/g, " ").slice(0, 55),
      folderId: c.folderId ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}
