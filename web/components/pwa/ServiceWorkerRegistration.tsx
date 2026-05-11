'use client'

import { useEffect } from 'react'

// Registers the service worker on mount. Lives in its own client component so
// the root layout can remain a server component.
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Swallow — SW failures aren't user-facing in v1.
    })
  }, [])
  return null
}
