// KITT Service Worker — PWA offline support
const CACHE_VERSION = 'kitt-v1'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Assets críticos que se pre-cachean al instalar
const PRECACHE_ASSETS = [
  '/',
  '/login',
  '/offline',
  '/manifest.json',
  '/kitt-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install: pre-cachear assets estáticos ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: limpiar caches viejos ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('kitt-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: network-first para API, cache-first para assets ────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) return

  // API y auth: siempre network, nunca cachear
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // Assets estáticos de Next.js (_next/static): cache-first, son inmutables
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Páginas de la app: network-first con fallback a cache, luego a /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match('/offline'))
        )
    )
    return
  }

  // Resto: network con fallback a cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  )
})

// ── Push notifications (para futuras notificaciones de WA/Gmail) ──────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }

  event.waitUntil(
    self.registration.showNotification(data.title || 'KITT', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'kitt-notification',
      data: { url: data.url || '/chat' },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/chat'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(targetUrl))
      if (existing) return existing.focus()
      return clients.openWindow(targetUrl)
    })
  )
})
