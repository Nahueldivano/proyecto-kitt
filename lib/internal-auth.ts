import { getConfig } from "@/lib/config"
import { NextRequest } from "next/server"

/**
 * Verifica que la request venga de n8n (o cualquier cliente interno)
 * usando el header x-internal-key.
 * Uso: if (!await verifyInternalKey(req)) return unauthorized()
 */
export async function verifyInternalKey(req: NextRequest): Promise<boolean> {
  const headerKey = req.headers.get("x-internal-key")
  if (!headerKey) return false

  const expectedKey = await getConfig("kittInternalKey")
  if (!expectedKey) return false

  // Comparación con timing-safe manual (evita timing attacks)
  if (headerKey.length !== expectedKey.length) return false
  let mismatch = 0
  for (let i = 0; i < headerKey.length; i++) {
    mismatch |= headerKey.charCodeAt(i) ^ expectedKey.charCodeAt(i)
  }
  return mismatch === 0
}
