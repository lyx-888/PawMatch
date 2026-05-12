'use client'

import { useSyncExternalStore } from 'react'

import { getProfileDraft, setProfileDraft as _setProfileDraft } from '@/lib/local-state'

// The localStorage version of `public.profiles`. Every column nullable so a
// partial answer is valid; the shape lines up 1:1 with the columns
// `PATCH /api/profile` accepts (Phase 2.3) so the eventual anon → account
// migration is a straight POST. Server-managed fields (completion_pct,
// updated_at, user_id) are deliberately excluded — clients never set them.
export type ProfileDraft = {
  housing_type?: 'hdb' | 'condo' | 'landed' | 'other' | null
  hdb_block_type?: string | null
  mesh_status?: 'meshed' | 'not_meshed' | 'planning' | null
  has_kids?: boolean | null
  kid_ages?: number[]
  other_pets?: 'none' | 'cats' | 'dogs' | 'both' | null
  work_pattern?: 'wfh' | 'hybrid' | 'office' | 'shift' | 'other' | null
  hours_alone?: number | null
  experience?: 'first_time' | 'some' | 'experienced' | null
  activity_level?: 'sedentary' | 'moderate' | 'very_active' | null
  budget_tier?: 'low' | 'medium' | 'high' | null
  special_needs_ok?: boolean | null
  species_pref?: ('dog' | 'cat' | 'rabbit' | 'other')[]
}

// The three essentials per requirements §2.2. Once these are answered the
// matching engine has enough signal to score every pet (essentials-only =
// cap-at-Good tier in §2.3); the rest are progressive.
export const ESSENTIAL_FIELDS = ['housing_type', 'has_kids', 'other_pets'] as const
export type EssentialField = (typeof ESSENTIAL_FIELDS)[number]

// Storage event channel used by `setProfileDraft` to notify hook subscribers.
// Co-located here so anyone using a draft hook picks up the same event name.
const PROFILE_DRAFT_EVENT = 'pawmatch:profile-draft'

export function readProfileDraft(): ProfileDraft {
  const raw = getProfileDraft<ProfileDraft>()
  return raw ?? {}
}

export function writeProfileDraft(draft: ProfileDraft): void {
  _setProfileDraft(draft)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROFILE_DRAFT_EVENT))
  }
}

// Merge `patch` over the current draft. Explicit `null` clears a field;
// `undefined` keeps the existing value. Returns the merged result so callers
// don't have to re-read.
export function mergeProfileDraft(patch: ProfileDraft): ProfileDraft {
  const current = readProfileDraft()
  const merged: Record<string, unknown> = { ...current }
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (value === null) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  const result = merged as ProfileDraft
  writeProfileDraft(result)
  return result
}

// Same percentage formula as the SQL trigger in migration
// 20260512000004 so anonymous users see an honest completion % that won't
// jump or drop when they later create an account.
export function computeCompletionPct(draft: ProfileDraft): number {
  let essentials = 0
  if (draft.housing_type != null) essentials += 1
  if (draft.has_kids != null) essentials += 1
  if (draft.other_pets != null) essentials += 1

  let progressive = 0
  if (draft.work_pattern != null) progressive += 1
  if (draft.hours_alone != null) progressive += 1
  if (draft.experience != null) progressive += 1
  if (draft.activity_level != null) progressive += 1
  if (draft.budget_tier != null) progressive += 1
  if (draft.special_needs_ok != null) progressive += 1
  if (draft.species_pref != null && draft.species_pref.length > 0) progressive += 1

  return Math.min(100, essentials * 20 + Math.round((progressive * 40) / 7))
}

export function hasAllEssentials(draft: ProfileDraft): boolean {
  return ESSENTIAL_FIELDS.every((field) => draft[field] != null)
}

// React hook that re-renders when the draft changes. Uses
// `useSyncExternalStore` (same pattern as `useFavorites`) so server-rendered
// markup matches the first client render — the draft is always empty during
// SSR.
export function useProfileDraft(): ProfileDraft {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === 'undefined') return () => {}
      const handler = () => {
        snapshotCache = null
        callback()
      }
      window.addEventListener(PROFILE_DRAFT_EVENT, handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener(PROFILE_DRAFT_EVENT, handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => getDraftSnapshot(),
    () => EMPTY_DRAFT,
  )
}

const EMPTY_DRAFT: ProfileDraft = Object.freeze({})
let snapshotCache: ProfileDraft | null = null

function getDraftSnapshot(): ProfileDraft {
  if (snapshotCache !== null) return snapshotCache
  snapshotCache = readProfileDraft()
  return snapshotCache
}
