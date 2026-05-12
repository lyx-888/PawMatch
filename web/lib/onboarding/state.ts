'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { hasAllEssentials, useProfileDraft } from './profile-draft'

// Tracks whether the user has dismissed the onboarding prompt or completed
// it. Stored in its own localStorage key so we can reset the prompt without
// touching the profile draft, and vice versa.

const ONBOARDING_STATE_KEY = 'pawmatch_onboarding_state'
const ONBOARDING_STATE_EVENT = 'pawmatch:onboarding-state'

// Phase 2.4 acceptance: "prompt appears at swipe #5". Stored as a constant
// so future tuning is a one-line change and tests can reference the same
// number.
export const SWIPE_PROMPT_THRESHOLD = 5

export type OnboardingState = {
  // ISO timestamp of when the user tapped "Not now". null when never
  // dismissed. We persist a single dismissal — the prompt doesn't re-fire
  // automatically. Progressive profiling (Phase 2.5) is what surfaces
  // follow-up questions later.
  dismissedAt: string | null
  // ISO timestamp of when the three essentials were last completed.
  // Cleared if the user later nulls one of those fields.
  completedAt: string | null
}

const DEFAULT_STATE: OnboardingState = { dismissedAt: null, completedAt: null }

function read(): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STATE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    return {
      dismissedAt: typeof parsed.dismissedAt === 'string' ? parsed.dismissedAt : null,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function write(state: OnboardingState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state))
  snapshotCache = null
  window.dispatchEvent(new CustomEvent(ONBOARDING_STATE_EVENT))
}

export function readOnboardingState(): OnboardingState {
  return read()
}

export function markOnboardingDismissed(): void {
  const current = read()
  write({ ...current, dismissedAt: new Date().toISOString() })
}

export function markOnboardingCompleted(): void {
  const current = read()
  write({ ...current, completedAt: new Date().toISOString() })
}

let snapshotCache: OnboardingState | null = null

function getSnapshot(): OnboardingState {
  if (snapshotCache !== null) return snapshotCache
  snapshotCache = read()
  return snapshotCache
}

function useOnboardingStateBase(): OnboardingState {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === 'undefined') return () => {}
      const handler = () => {
        snapshotCache = null
        callback()
      }
      window.addEventListener(ONBOARDING_STATE_EVENT, handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener(ONBOARDING_STATE_EVENT, handler)
        window.removeEventListener('storage', handler)
      }
    },
    () => getSnapshot(),
    () => DEFAULT_STATE,
  )
}

/**
 * Decide whether the onboarding prompt should be shown right now.
 *
 * Inputs:
 *   * `swipesThisSession` — number of swipes since the page loaded.
 *   * Onboarding state from localStorage (dismissed / completed).
 *   * Profile draft from localStorage (already has essentials?).
 *
 * Rules:
 *   * Don't show if essentials are already filled (draft from a previous
 *     session, or just-completed in this one).
 *   * Don't show if the user dismissed it.
 *   * Show once `swipesThisSession >= SWIPE_PROMPT_THRESHOLD`.
 */
export function useShouldShowOnboardingPrompt(swipesThisSession: number): boolean {
  const state = useOnboardingStateBase()
  const draft = useProfileDraft()
  if (state.dismissedAt) return false
  if (state.completedAt) return false
  if (hasAllEssentials(draft)) return false
  return swipesThisSession >= SWIPE_PROMPT_THRESHOLD
}

export function useOnboardingActions(): {
  dismiss: () => void
  complete: () => void
} {
  const dismiss = useCallback(() => markOnboardingDismissed(), [])
  const complete = useCallback(() => markOnboardingCompleted(), [])
  return { dismiss, complete }
}
