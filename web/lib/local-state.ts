'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { sanitizeNote } from '@/lib/notes/sanitize'

// Anonymous user state lives in localStorage. Favorites cap hard-blocks at 200
// (warning at 150) per requirements §2.14; passes evict FIFO at 1000. Profile
// drafts are JSON blobs.

export const FAVORITES_KEY = 'pawmatch_favorites'
export const FAVORITE_NOTES_KEY = 'pawmatch_favorite_notes'
export const PASSES_KEY = 'pawmatch_passes'
export const PROFILE_DRAFT_KEY = 'pawmatch_profile_draft'

export const FAVORITES_CAP = 200
export const FAVORITES_WARNING_AT = 150
export const PASSES_CAP = 1000

type IdSet = { ids: string[] }

function read(key: string): IdSet {
  if (typeof window === 'undefined') return { ids: [] }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return { ids: [] }
    const parsed = JSON.parse(raw) as Partial<IdSet>
    return { ids: Array.isArray(parsed.ids) ? parsed.ids.filter((v) => typeof v === 'string') : [] }
  } catch {
    return { ids: [] }
  }
}

function write(key: string, value: IdSet): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
  snapshotCache.delete(key)
  window.dispatchEvent(new CustomEvent('pawmatch:local-state', { detail: { key } }))
}

export type AddFavoriteResult = 'added' | 'already-present' | 'cap-reached'

export function addFavorite(id: string): AddFavoriteResult {
  const current = read(FAVORITES_KEY)
  if (current.ids.includes(id)) return 'already-present'
  if (current.ids.length >= FAVORITES_CAP) return 'cap-reached'
  write(FAVORITES_KEY, { ids: [...current.ids, id] })
  return 'added'
}

export function removeFavorite(id: string): void {
  const current = read(FAVORITES_KEY)
  if (!current.ids.includes(id)) return
  write(FAVORITES_KEY, { ids: current.ids.filter((v) => v !== id) })
  // A note without its favorite would be unreachable from the UI — drop it
  // so a re-favorite gets a clean slate rather than the old stale text.
  const notes = readNotes()
  if (id in notes) {
    const next = { ...notes }
    delete next[id]
    writeNotes(next)
  }
}

export function getFavorites(): string[] {
  return read(FAVORITES_KEY).ids
}

export type AddPassResult = 'added' | 'already-present' | 'evicted-oldest'

export function addPass(id: string): AddPassResult {
  const current = read(PASSES_KEY)
  if (current.ids.includes(id)) return 'already-present'
  if (current.ids.length >= PASSES_CAP) {
    const trimmed = [...current.ids.slice(current.ids.length - PASSES_CAP + 1), id]
    write(PASSES_KEY, { ids: trimmed })
    return 'evicted-oldest'
  }
  write(PASSES_KEY, { ids: [...current.ids, id] })
  return 'added'
}

export function getPasses(): string[] {
  return read(PASSES_KEY).ids
}

export function getExcludeIds(): string[] {
  return [...getFavorites(), ...getPasses()]
}

export function getProfileDraft<T = unknown>(): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PROFILE_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function setProfileDraft<T>(value: T): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(value))
}

// --- favorite notes --------------------------------------------------------
//
// Stored as a `{ [petId]: text }` map under a single key so the existing
// favorites id list stays a pure array. Empty strings are deleted rather
// than stored so reading a never-noted pet returns '' deterministically.

type NoteMap = Record<string, string>

function readNotes(): NoteMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(FAVORITE_NOTES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: NoteMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeNotes(value: NoteMap): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FAVORITE_NOTES_KEY, JSON.stringify(value))
  noteSnapshotCache = null
  window.dispatchEvent(
    new CustomEvent('pawmatch:local-state', { detail: { key: FAVORITE_NOTES_KEY } }),
  )
}

export function getFavoriteNote(petId: string): string {
  return readNotes()[petId] ?? ''
}

export function setFavoriteNote(petId: string, text: string): string {
  const clean = sanitizeNote(text)
  const current = readNotes()
  if (clean.length === 0) {
    if (!(petId in current)) return ''
    const next = { ...current }
    delete next[petId]
    writeNotes(next)
    return ''
  }
  if (current[petId] === clean) return clean
  writeNotes({ ...current, [petId]: clean })
  return clean
}

// Cache the latest snapshot per key so useSyncExternalStore can return a stable
// reference between calls — React bails out when the snapshot identity matches.
const snapshotCache = new Map<string, string[]>()

function readSnapshot(key: string): string[] {
  const ids = read(key).ids
  const cached = snapshotCache.get(key)
  if (cached && cached.length === ids.length && cached.every((v, i) => v === ids[i])) {
    return cached
  }
  snapshotCache.set(key, ids)
  return ids
}

function subscribeToKey(key: string, callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    if (event instanceof CustomEvent && event.detail?.key === key) {
      snapshotCache.delete(key)
      callback()
    } else if (event instanceof StorageEvent && event.key === key) {
      snapshotCache.delete(key)
      callback()
    }
  }
  window.addEventListener('pawmatch:local-state', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('pawmatch:local-state', handler)
    window.removeEventListener('storage', handler)
  }
}

const EMPTY_IDS: readonly string[] = []

function useLocalIdSet(key: string): string[] {
  return useSyncExternalStore(
    (callback) => subscribeToKey(key, callback),
    () => readSnapshot(key),
    () => EMPTY_IDS as string[],
  )
}

export function useFavorites(): {
  ids: string[]
  count: number
  warning: boolean
  capReached: boolean
  add: (id: string) => AddFavoriteResult
  remove: (id: string) => void
  has: (id: string) => boolean
} {
  const ids = useLocalIdSet(FAVORITES_KEY)
  const add = useCallback((id: string) => addFavorite(id), [])
  const remove = useCallback((id: string) => removeFavorite(id), [])
  const has = useCallback((id: string) => ids.includes(id), [ids])
  return {
    ids,
    count: ids.length,
    warning: ids.length >= FAVORITES_WARNING_AT && ids.length < FAVORITES_CAP,
    capReached: ids.length >= FAVORITES_CAP,
    add,
    remove,
    has,
  }
}

// useSyncExternalStore needs a stable snapshot. We cache the parsed map per
// store version (versioned by clearing on every write).
let noteSnapshotCache: NoteMap | null = null

function readNotesSnapshot(): NoteMap {
  if (noteSnapshotCache) return noteSnapshotCache
  noteSnapshotCache = readNotes()
  return noteSnapshotCache
}

function subscribeToNotes(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    if (event instanceof CustomEvent && event.detail?.key === FAVORITE_NOTES_KEY) {
      noteSnapshotCache = null
      callback()
    } else if (event instanceof StorageEvent && event.key === FAVORITE_NOTES_KEY) {
      noteSnapshotCache = null
      callback()
    }
  }
  window.addEventListener('pawmatch:local-state', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('pawmatch:local-state', handler)
    window.removeEventListener('storage', handler)
  }
}

const EMPTY_NOTES: NoteMap = {}

export function useFavoriteNote(petId: string): {
  note: string
  setNote: (text: string) => void
} {
  const map = useSyncExternalStore(subscribeToNotes, readNotesSnapshot, () => EMPTY_NOTES)
  const setNote = useCallback((text: string) => setFavoriteNote(petId, text), [petId])
  return { note: map[petId] ?? '', setNote }
}

export function usePasses(): {
  ids: string[]
  count: number
  add: (id: string) => AddPassResult
  has: (id: string) => boolean
} {
  const ids = useLocalIdSet(PASSES_KEY)
  const add = useCallback((id: string) => addPass(id), [])
  const has = useCallback((id: string) => ids.includes(id), [ids])
  return { ids, count: ids.length, add, has }
}
