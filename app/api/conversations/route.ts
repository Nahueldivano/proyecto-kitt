import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const conversations = await db.conversation.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
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
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title ?? (c.messages[0]?.content ?? "Conversación").replace(/\n/g, " ").slice(0, 55),
      createdAt: c.createdAt.toISOString(),
      folderId: c.folderId ?? null,
    })),
  })
}
