// PawMatch SG service worker — Phase 1 only does offline cache of the last
// successful pet feed and the app shell. Notifications + push wiring come in
// Phase 3 (3.4). Keep the cache name versioned so updates ship cleanly.
//
// Strategy:
//   * Navigation (HTML) requests → network-first with cache fallback. The
//     header counter ("X pets across N shelters · last updated …") is
//     rendered server-side into the HTML, so a cache-first page meant repeat
//     visitors saw the counter from the SW's snapshot at install time rather
//     than today's scrape.
//   * `/api/*` → network-first. Data must be fresh when online; cache is
//     only there as an offline fallback.
//   * Same-origin static assets → cache-first. Next.js content-hashes its
//     bundles, so old hashes are safe to serve from cache forever.

const CACHE_NAME = 'pawmatch-v2'
const APP_SHELL = ['/', '/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      // Only cache successful, basic (same-origin) responses. Skip opaque
      // and error responses so we don't pin a 500 or a redirect.
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone()
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => {})
      }
      return response
    })
    .catch(() => caches.match(request))
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // hotlinked photos pass through

  // HTML navigations: always try the network so the server-rendered header
  // counter and any other SSR data reflect the latest scrape.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  // All API routes: network-first. Phase 1 only `/api/pets` mattered; with
  // SOSD + OSCAS live we extend the same policy to `/api/sources` and the
  // others so nothing else can serve stale data.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Static assets (JS, CSS, fonts, icons, the manifest): cache-first.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
})
