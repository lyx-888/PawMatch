'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { hasAllEssentials, useProfileDraft, type ProfileDraft } from './profile-draft'

// Tracks whether the user has dismissed the onboarding prompt or completed
// it. Stored in its own localStorage key so we can reset the prompt without
// touching the profile draft, and vice versa.

const ONBOARDING_STATE_KEY = 'pawmatch_onboarding_state'
const ONBOARDING_STATE_EVENT = 'pawmatch:onboarding-state'

export type OnboardingState = {
  // ISO timestamp of when the user tapped "Skip". null when never dismissed.
  // We persist a single dismissal — the prompt doesn't re-fire automatically.
  // Progressive profiling (Phase 2.5) is what surfaces follow-up questions
  // later.
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
 * Pure predicate: decide whether the upfront quiz should be shown for the
 * given onboarding state + profile draft. Exported so unit tests can pin the
 * rules without a React render. The hook wrapper below is the thing actual
 * components use.
 *
 * Rules (post-Phase 2.4 rework — see docs/requirements/02-features.md §2.2):
 *   * Don't show if essentials are already filled (draft from a previous
 *     session, or just-completed in this one).
 *   * Don't show if the user dismissed it (skip is sticky across sessions).
 *   * Otherwise show — first visit, no profile yet, never skipped.
 */
export function shouldShowOnboardingOnFirstVisit(
  state: OnboardingState,
  draft: ProfileDraft,
): boolean {
  if (state.dismissedAt) return false
  if (state.completedAt) return false
  if (hasAllEssentials(draft)) return false
  return true
}

/**
 * React hook variant: subscribes to localStorage so the quiz auto-hides
 * once the user completes or skips it.
 */
export function useShouldShowOnboardingOnFirstVisit(): boolean {
  const state = useOnboardingStateBase()
  const draft = useProfileDraft()
  return shouldShowOnboardingOnFirstVisit(state, draft)
}

export function useOnboardingActions(): {
  dismiss: () => void
  complete: () => void
} {
  const dismiss = useCallback(() => markOnboardingDismissed(), [])
  const complete = useCallback(() => markOnboardingCompleted(), [])
  return { dismiss, complete }
}
