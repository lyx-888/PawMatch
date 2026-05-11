// PawMatch SG service worker — Phase 1 only does offline cache of the last
// successful pet feed and the app shell. Notifications + push wiring come in
// Phase 3 (3.4). Keep the cache name versioned so updates ship cleanly.

const CACHE_NAME = 'pawmatch-v1'
const APP_SHELL = ['/', '/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
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

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return  // hotlinked photos pass through

  // Network-first for API: keep data fresh, fall back to cache offline.
  if (url.pathname.startsWith('/api/pets')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  // Cache-first for app shell.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  )
})
