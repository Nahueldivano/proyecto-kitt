import Redis from "ioredis"

// Singleton de Redis para evitar múltiples conexiones en dev (hot-reload)
const globalForRedis = globalThis as unknown as { redis?: Redis }

function createClient(): Redis {
  const url = process.env.REDIS_URL
  if (!url) {
    // Sin Redis configurado — todas las funciones de memoria son no-ops
    throw new Error("REDIS_URL no configurada")
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })
  client.on("error", (err) => {
    // No crashear la app si Redis no está disponible
    console.warn("[redis] error de conexión:", err.message)
  })
  return client
}

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createClient()
  }
  return globalForRedis.redis
}

/**
 * Wrapper seguro: si Redis no está disponible, retorna null sin tirar error.
 */
export async function safeGet(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key)
  } catch {
    return null
  }
}

export async function safeSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    if (ttlSeconds) {
      await getRedis().setex(key, ttlSeconds, value)
    } else {
      await getRedis().set(key, value)
    }
  } catch {
    // No-op — la app sigue funcionando sin Redis
  }
}
