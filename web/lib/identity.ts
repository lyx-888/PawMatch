'use client'

import { useSyncExternalStore } from 'react'

// PawMatch's anonymous identity is a UUID kept entirely in localStorage. The
// server never sees it until account creation, at which point /api/auth/migrate
// (Phase 3) hands over the local data. Keep this client-only.

export const ANONYMOUS_ID_KEY = 'pawmatch_anonymous_id'

function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  // Last-resort fallback for ancient environments (jsdom < 23 etc.). Real
  // browsers always take the path above.
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') {
    throw new Error('getAnonymousId called on the server. Use useAnonymousId in client components.')
  }
  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY)
  if (existing) return existing
  const fresh = generateUuid()
  window.localStorage.setItem(ANONYMOUS_ID_KEY, fresh)
  return fresh
}

function subscribeAnonymousId(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: StorageEvent) => {
    if (event.key === ANONYMOUS_ID_KEY) callback()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function useAnonymousId(): string | null {
  return useSyncExternalStore(
    subscribeAnonymousId,
    () => getAnonymousId(),
    () => null,
  )
}
