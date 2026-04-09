import { db } from "@/lib/db"

// =============================================================
// Config runtime — lee de AppConfig DB (cache 10s) con fallback a .env
// =============================================================

type ConfigKey =
  | "anthropicApiKey"
  | "evolutionUrl"
  | "evolutionKey"
  | "googleClientId"
  | "googleClientSecret"
  | "kittInternalKey"
  | "kittAdminEmail"

// Mapeo de keys de DB a variables de entorno
const ENV_FALLBACK: Record<ConfigKey, string> = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  evolutionUrl: "EVOLUTION_API_URL",
  evolutionKey: "EVOLUTION_API_KEY",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
  kittInternalKey: "KITT_INTERNAL_KEY",
  kittAdminEmail: "KITT_ADMIN_EMAIL",
}

// Cache en memoria con TTL de 10 segundos
let cache: Map<string, string> = new Map()
let cacheTimestamp = 0
const CACHE_TTL = 10_000

async function loadAllFromDb(): Promise<Map<string, string>> {
  const rows = await db.appConfig.findMany()
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.value) map.set(row.key, row.value)
  }
  return map
}

export async function getConfig(key: ConfigKey): Promise<string> {
  const now = Date.now()

  // Refrescar cache si venció
  if (now - cacheTimestamp > CACHE_TTL) {
    try {
      cache = await loadAllFromDb()
      cacheTimestamp = now
    } catch {
      // Si falla la DB, usar lo que hay en cache o caer a .env
    }
  }

  // 1. Buscar en cache de DB
  const dbValue = cache.get(key)
  if (dbValue) return dbValue

  // 2. Fallback a variable de entorno
  const envKey = ENV_FALLBACK[key]
  const envValue = process.env[envKey]
  if (envValue) return envValue

  return ""
}

export async function getAllConfig(): Promise<
  Record<string, { value: string; source: "db" | "env" | "empty" }>
> {
  const now = Date.now()
  if (now - cacheTimestamp > CACHE_TTL) {
    try {
      cache = await loadAllFromDb()
      cacheTimestamp = now
    } catch {
      // ignorar
    }
  }

  const result: Record<string, { value: string; source: "db" | "env" | "empty" }> = {}

  for (const key of Object.keys(ENV_FALLBACK) as ConfigKey[]) {
    const dbValue = cache.get(key)
    if (dbValue) {
      result[key] = { value: dbValue, source: "db" }
    } else {
      const envKey = ENV_FALLBACK[key]
      const envValue = process.env[envKey]
      if (envValue) {
        result[key] = { value: envValue, source: "env" }
      } else {
        result[key] = { value: "", source: "empty" }
      }
    }
  }

  return result
}

export function invalidateCache() {
  cacheTimestamp = 0
  cache = new Map()
}
