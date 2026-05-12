'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { mergeProfileDraft, useProfileDraft, type ProfileDraft } from './profile-draft'

// Progressive profiling per requirements §2.2 step 4. Six questions, each
// gated by a context-aware predicate. The framework here owns:
//
//   * the canonical registry (this file is the single source of truth);
//   * the "already asked" state in localStorage so a dismissed question
//     never re-fires;
//   * a hook that, given the current page's context, returns the next
//     question that should be shown — or null if nothing applies.
//
// What fires today:
//   * First favorite       → work_pattern
//   * Third favorite       → experience
//   * Cat detail page open → mesh_status
//
// What's defined but dormant (data not yet available):
//   * First "Stretch" tier shown    → activity_level    (needs Phase 2.6 scoring)
//   * First special-needs pet view  → special_needs_ok (needs Phase 2.6 tags pipeline output)
//   * Saving a search               → budget_tier       (needs Phase 3 saved searches)
//
// Each dormant trigger is defined alongside the active ones so flipping it
// on later is a context-shape change, not a registry change.

// --- Context --------------------------------------------------------------

export type PetTier = 'great' | 'good' | 'stretch'

export type ProgressiveContext = {
  // From useFavorites(). Used by first-favorite (>= 1) and third-favorite
  // (>= 3) triggers.
  favoritesCount: number
  // Set when the user is on a pet detail page. Drives the mesh_status
  // trigger (cats) and special_needs_ok trigger (special-needs pets).
  viewingPetSpecies?: 'dog' | 'cat' | 'rabbit' | 'other'
  viewingPetIsSpecialNeeds?: boolean
  // Set when the matching engine renders the tier badge on a card. Drives
  // the activity_level trigger when the user first sees a 'stretch' result.
  // Empty until Phase 2.6 lands.
  viewingPetTier?: PetTier
  // True only on the page that just saved a search. Empty until Phase 3.
  justSavedSearch?: boolean
}

// --- Question registry ----------------------------------------------------

export type ProgressiveOption<T> = { value: T; labelKey: string }

// Mapping from question id to the value type it sets on ProfileDraft.
// Encoded as a discriminated union so `applyAnswer` is type-safe.
export type ProgressiveAnswer =
  | { id: 'mesh_status'; value: NonNullable<ProfileDraft['mesh_status']> }
  | { id: 'work_pattern'; value: NonNullable<ProfileDraft['work_pattern']> }
  | { id: 'experience'; value: NonNullable<ProfileDraft['experience']> }
  | { id: 'activity_level'; value: NonNullable<ProfileDraft['activity_level']> }
  | { id: 'special_needs_ok'; value: boolean }
  | { id: 'budget_tier'; value: NonNullable<ProfileDraft['budget_tier']> }

export type ProgressiveQuestionId = ProgressiveAnswer['id']

type RegistryEntry<A extends ProgressiveAnswer> = {
  id: A['id']
  promptKey: string
  options: ProgressiveOption<A['value']>[]
  shouldTrigger: (draft: ProfileDraft, ctx: ProgressiveContext) => boolean
}

export type ProgressiveQuestion = RegistryEntry<ProgressiveAnswer>

// Order = priority. The hook returns the first match, so most-specific
// triggers go first (so "first stretch" doesn't pre-empt "cat viewed" when
// both are firing on the same render).
export const PROGRESSIVE_QUESTIONS: ProgressiveQuestion[] = [
  {
    id: 'mesh_status',
    promptKey: 'progressive.mesh_status.prompt',
    options: [
      { value: 'meshed', labelKey: 'progressive.mesh_status.opt.meshed' },
      { value: 'not_meshed', labelKey: 'progressive.mesh_status.opt.not_meshed' },
      { value: 'planning', labelKey: 'progressive.mesh_status.opt.planning' },
    ],
    shouldTrigger: (draft, ctx) => draft.mesh_status == null && ctx.viewingPetSpecies === 'cat',
  },
  {
    id: 'special_needs_ok',
    promptKey: 'progressive.special_needs_ok.prompt',
    options: [
      { value: true, labelKey: 'progressive.special_needs_ok.opt.yes' },
      { value: false, labelKey: 'progressive.special_needs_ok.opt.no' },
    ],
    shouldTrigger: (draft, ctx) =>
      draft.special_needs_ok == null && ctx.viewingPetIsSpecialNeeds === true,
  },
  {
    id: 'activity_level',
    promptKey: 'progressive.activity_level.prompt',
    options: [
      { value: 'sedentary', labelKey: 'progressive.activity_level.opt.sedentary' },
      { value: 'moderate', labelKey: 'progressive.activity_level.opt.moderate' },
      { value: 'very_active', labelKey: 'progressive.activity_level.opt.very_active' },
    ],
    // Fires on the first Stretch-tier card the user sees. Dormant until the
    // matching engine starts populating `viewingPetTier`.
    shouldTrigger: (draft, ctx) => draft.activity_level == null && ctx.viewingPetTier === 'stretch',
  },
  {
    id: 'work_pattern',
    promptKey: 'progressive.work_pattern.prompt',
    options: [
      { value: 'wfh', labelKey: 'progressive.work_pattern.opt.wfh' },
      { value: 'hybrid', labelKey: 'progressive.work_pattern.opt.hybrid' },
      { value: 'office', labelKey: 'progressive.work_pattern.opt.office' },
      { value: 'shift', labelKey: 'progressive.work_pattern.opt.shift' },
      { value: 'other', labelKey: 'progressive.work_pattern.opt.other' },
    ],
    shouldTrigger: (draft, ctx) => draft.work_pattern == null && ctx.favoritesCount >= 1,
  },
  {
    id: 'experience',
    promptKey: 'progressive.experience.prompt',
    options: [
      { value: 'first_time', labelKey: 'progressive.experience.opt.first_time' },
      { value: 'some', labelKey: 'progressive.experience.opt.some' },
      { value: 'experienced', labelKey: 'progressive.experience.opt.experienced' },
    ],
    shouldTrigger: (draft, ctx) => draft.experience == null && ctx.favoritesCount >= 3,
  },
  {
    id: 'budget_tier',
    promptKey: 'progressive.budget_tier.prompt',
    options: [
      { value: 'low', labelKey: 'progressive.budget_tier.opt.low' },
      { value: 'medium', labelKey: 'progressive.budget_tier.opt.medium' },
      { value: 'high', labelKey: 'progressive.budget_tier.opt.high' },
    ],
    shouldTrigger: (draft, ctx) => draft.budget_tier == null && ctx.justSavedSearch === true,
  },
]

// --- Asked/answered/dismissed state --------------------------------------

const PROGRESSIVE_STATE_KEY = 'pawmatch_progressive_state'
const PROGRESSIVE_EVENT = 'pawmatch:progressive-state'

export type ProgressiveEntry = {
  askedAt: string
  answeredAt?: string
  dismissedAt?: string
}

export type ProgressiveState = Partial<Record<ProgressiveQuestionId, ProgressiveEntry>>

function readState(): ProgressiveState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PROGRESSIVE_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<string, ProgressiveEntry>>
    // Drop unknown ids so a future schema change doesn't trip the typed reads.
    const known = new Set(PROGRESSIVE_QUESTIONS.map((q) => q.id as string))
    const out: ProgressiveState = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (known.has(k) && v && typeof v.askedAt === 'string') {
        out[k as ProgressiveQuestionId] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeState(state: ProgressiveState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROGRESSIVE_STATE_KEY, JSON.stringify(state))
  snapshotCache = null
  window.dispatchEvent(new CustomEvent(PROGRESSIVE_EVENT))
}

export function readProgressiveState(): ProgressiveState {
  return readState()
}

function recordEntry(id: ProgressiveQuestionId, patch: Partial<ProgressiveEntry>): void {
  const state = readState()
  const existing: ProgressiveEntry = state[id] ?? { askedAt: new Date().toISOString() }
  state[id] = { ...existing, ...patch }
  writeState(state)
}

export function markProgressiveAsked(id: ProgressiveQuestionId): void {
  const state = readState()
  if (state[id]) return // first-shown wins; re-mounts don't reset askedAt
  state[id] = { askedAt: new Date().toISOString() }
  writeState(state)
}

export function markProgressiveAnswered(id: ProgressiveQuestionId): void {
  recordEntry(id, { answeredAt: new Date().toISOString() })
}

export function markProgressiveDismissed(id: ProgressiveQuestionId): void {
  recordEntry(id, { dismissedAt: new Date().toISOString() })
}

// --- Hook -----------------------------------------------------------------

let snapshotCache: ProgressiveState | null = null

function getSnapshot(): ProgressiveState {
  if (snapshotCache !== null) return snapshotCache
  snapshotCache = readState()
  return snapshotCache
}

function useProgressiveState(): ProgressiveState {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === 'undefined') return () => {}
      const handler = () => {
        snapshotCache = null
        callback()
      }
      window.addEventListener(PROGRESSIVE_EVENT, handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener(PROGRESSIVE_EVENT, handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => getSnapshot(),
    () => EMPTY_STATE,
  )
}

const EMPTY_STATE: ProgressiveState = Object.freeze({})

/**
 * Return the next progressive question that should be shown given the
 * current draft + page context, or `null` if nothing applies.
 *
 * A question is "shown" once per user (until they clear localStorage); both
 * answering and dismissing count as a single-shot. The matching-engine work
 * in Phase 2.6 will surface re-prompt mechanisms via a different code path
 * (the profile page).
 */
export function useNextProgressiveQuestion(
  context: ProgressiveContext,
): ProgressiveQuestion | null {
  const draft = useProfileDraft()
  const state = useProgressiveState()
  for (const q of PROGRESSIVE_QUESTIONS) {
    if (state[q.id]) continue // already asked once
    if (q.shouldTrigger(draft, context)) return q
  }
  return null
}

// --- Answer + dismiss helpers (for the card UI) ---------------------------

export function answerProgressive(answer: ProgressiveAnswer): void {
  // mergeProfileDraft handles the typing across the discriminated union.
  mergeProfileDraft({ [answer.id]: answer.value } as ProfileDraft)
  markProgressiveAnswered(answer.id)
}

export function useDismissProgressive(): (id: ProgressiveQuestionId) => void {
  return useCallback((id: ProgressiveQuestionId) => markProgressiveDismissed(id), [])
}
