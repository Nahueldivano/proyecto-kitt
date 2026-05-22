import { google } from "googleapis"
import type { OAuth2Client } from "google-auth-library"
import { db } from "@/lib/db"
import { getConfig } from "@/lib/config"
import { encrypt, decrypt } from "@/lib/crypto"

// =============================================================
// Gmail API — OAuth2
// TODAS las funciones son async porque leen config de DB
// =============================================================

export async function getOAuthClient(): Promise<OAuth2Client> {
  const [clientId, clientSecret] = await Promise.all([
    getConfig("googleClientId"),
    getConfig("googleClientSecret"),
  ])

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/email/callback`

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export async function getAuthUrl(): Promise<string> {
  const client = await getOAuthClient()

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  })
}

export async function getGmailClient(tenantId: string) {
  const connection = await db.gmailConnection.findUnique({
    where: { tenantId },
  })

  if (!connection) {
    throw new Error("Gmail no está conectado para este tenant")
  }

  const client = await getOAuthClient()
  client.setCredentials({
    access_token: decrypt(connection.accessToken),
    refresh_token: decrypt(connection.refreshToken),
  })

  // Refrescar token si es necesario
  client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.gmailConnection.update({
        where: { tenantId },
        data: {
          accessToken: encrypt(tokens.access_token),
          ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
        },
      })
    }
  })

  return google.gmail({ version: "v1", auth: client })
}

export interface EmailSummary {
  id: string
  from: string
  subject: string
  snippet: string
  date: string
  threadId: string
}

export interface EmailFull extends EmailSummary {
  body: string
}

export async function listUnreadEmails(
  tenantId: string,
  maxResults = 10,
  includeRead = false,
  daysBack?: number
): Promise<EmailSummary[]> {
  const gmail = await getGmailClient(tenantId)

  let q = includeRead ? "" : "is:unread"
  if (daysBack && daysBack > 0) {
    const after = new Date()
    after.setDate(after.getDate() - daysBack)
    const afterStr = `${after.getFullYear()}/${String(after.getMonth() + 1).padStart(2, "0")}/${String(after.getDate()).padStart(2, "0")}`
    q = q ? `${q} after:${afterStr}` : `after:${afterStr}`
  }

  const list = await gmail.users.messages.list({
    userId: "me",
    ...(q ? { q } : {}),
    maxResults,
  })

  const messages = list.data.messages ?? []
  if (messages.length === 0) return []

  const emails = await Promise.all(
    messages.map(async (m) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      })

      const headers = msg.data.payload?.headers ?? []
      const get = (name: string) =>
        headers.find((h) => h.name === name)?.value ?? ""

      return {
        id: m.id!,
        threadId: msg.data.threadId ?? "",
        from: get("From"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: msg.data.snippet ?? "",
      }
    })
  )

  return emails
}

export async function readEmail(
  tenantId: string,
  messageId: string
): Promise<EmailFull> {
  const gmail = await getGmailClient(tenantId)

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  })

  const headers = msg.data.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h) => h.name === name)?.value ?? ""

  // Extraer body del email
  let body = ""
  const payload = msg.data.payload

  function extractBody(part: typeof payload): string {
    if (!part) return ""
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8")
    }
    if (part.parts) {
      for (const p of part.parts) {
        const text = extractBody(p)
        if (text) return text
      }
    }
    return ""
  }

  body = extractBody(payload)

  return {
    id: messageId,
    threadId: msg.data.threadId ?? "",
    from: get("From"),
    subject: get("Subject"),
    date: get("Date"),
    snippet: msg.data.snippet ?? "",
    body,
  }
}

export async function sendEmail(
  tenantId: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = await getGmailClient(tenantId)

  const isHtml = body.trimStart().startsWith("<")
  const contentType = isHtml ? "text/html; charset=UTF-8" : "text/plain; charset=UTF-8"
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`

  const message = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}`,
    "",
    body,
  ].join("\n")

  const encoded = Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  })
}

export async function replyToEmail(
  tenantId: string,
  threadId: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const gmail = await getGmailClient(tenantId)

  const isHtml = body.trimStart().startsWith("<")
  const contentType = isHtml ? "text/html; charset=UTF-8" : "text/plain; charset=UTF-8"
  const encodedSubject = `=?UTF-8?B?${Buffer.from(`Re: ${subject}`, "utf-8").toString("base64")}?=`

  const message = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}`,
    "",
    body,
  ].join("\n")

  const encoded = Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded, threadId },
  })
}
