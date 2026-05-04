import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// =============================================================
// Encriptación AES-256-GCM para datos sensibles en la DB
// (tokens de Gmail, API keys de Anthropic, etc.)
// =============================================================

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY no configurada o inválida. " +
      "Debe ser un string hexadecimal de 64 caracteres. " +
      "Generá una con: openssl rand -hex 32"
    )
  }
  return Buffer.from(hex, "hex")
}

/**
 * Encripta un texto con AES-256-GCM.
 * Retorna: iv:authTag:ciphertext (todo en hex, separado por ':')
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Desencripta un texto previamente encriptado con encrypt().
 * Si el texto no tiene el formato esperado (ej: datos legacy sin encriptar),
 * retorna el texto tal cual para compatibilidad con datos existentes.
 */
export function decrypt(ciphertext: string): string {
  // Si no tiene el formato iv:tag:data, es un valor legacy sin encriptar
  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    return ciphertext
  }

  try {
    const key = getKey()
    const [ivHex, authTagHex, encryptedHex] = parts
    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")
    const encrypted = Buffer.from(encryptedHex, "hex")

    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])
    return decrypted.toString("utf8")
  } catch {
    // Si falla la desencriptación, asumir que es un valor legacy
    return ciphertext
  }
}

/**
 * Encripta solo si el valor no está ya encriptado (formato iv:tag:data).
 * Útil para migraciones graduales.
 */
export function encryptIfNeeded(value: string): string {
  const parts = value.split(":")
  if (parts.length === 3 && parts[0].length === 24 && parts[1].length === 32) {
    // Ya parece encriptado (iv=12 bytes hex=24 chars, tag=16 bytes hex=32 chars)
    return value
  }
  return encrypt(value)
}
