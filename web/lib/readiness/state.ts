'use client'

import { useCallback, useSyncExternalStore } from 'react'

import {
  pickSnippetForContext,
  type Snippet,
  type SnippetContext,
  type SnippetId,
} from './snippets'

// Tracks which readiness snippets the user has already seen so we never
// re-prompt. Mirrors the onboarding/progressive state shape — a single
// localStorage key holding a `{ ids: SnippetId[] }` set.

export const READINESS_KEY = 'pawmatch_readiness_seen'
const EVENT_NAME = 'pawmatch:readiness'

type SeenState = { ids: SnippetId[] }

function read(): SeenState {
  if (typeof window === 'undefined') return { ids: [] }
  try {
    const raw = window.localStorage.getItem(READINESS_KEY)
    if (!raw) return { ids: [] }
    const parsed = JSON.parse(raw) as Partial<SeenState>
    return {
      ids: Array.isArray(parsed.ids)
        ? parsed.ids.filter((v): v is SnippetId => typeof v === 'string')
        : [],
    }
  } catch {
    return { ids: [] }
  }
}

function write(value: SeenState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(READINESS_KEY, JSON.stringify(value))
  snapshotCache = null
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function markSnippetSeen(id: SnippetId): void {
  const current = read()
  if (current.ids.includes(id)) return
  write({ ids: [...current.ids, id] })
}

export function getSeenSnippetIds(): SnippetId[] {
  return read().ids
}

let snapshotCache: SnippetId[] | null = null

function readSnapshot(): SnippetId[] {
  if (snapshotCache) return snapshotCache
  snapshotCache = read().ids
  return snapshotCache
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    if (
      event.type === EVENT_NAME ||
      (event instanceof StorageEvent && event.key === READINESS_KEY)
    ) {
      snapshotCache = null
      callback()
    }
  }
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', handler)
  }
}

const EMPTY: SnippetId[] = []

export function useSeenSnippets(): SnippetId[] {
  return useSyncExternalStore(subscribe, readSnapshot, () => EMPTY)
}

/** Returns the first eligible un-seen snippet, plus a stable `dismiss` callback. */
export function useReadinessSnippet(ctx: SnippetContext): {
  snippet: Snippet | null
  dismiss: () => void
} {
  const seen = useSeenSnippets()
  const seenSet = new Set(seen)
  const snippet = pickSnippetForContext(ctx, seenSet)
  const id = snippet?.id
  const dismiss = useCallback(() => {
    if (id) markSnippetSeen(id)
  }, [id])
  return { snippet, dismiss }
}
