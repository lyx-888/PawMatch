import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  computeCompletionPct,
  hasAllEssentials,
  mergeProfileDraft,
  readProfileDraft,
  writeProfileDraft,
} from '@/lib/onboarding/profile-draft'
import {
  markOnboardingCompleted,
  markOnboardingDismissed,
  readOnboardingState,
  shouldShowOnboardingOnFirstVisit,
} from '@/lib/onboarding/state'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('profile draft persistence', () => {
  it('starts empty', () => {
    expect(readProfileDraft()).toEqual({})
  })

  it('round-trips through localStorage', () => {
    writeProfileDraft({ housing_type: 'hdb', has_kids: false })
    expect(readProfileDraft()).toEqual({ housing_type: 'hdb', has_kids: false })
  })

  it('mergeProfileDraft adds fields without clobbering existing ones', () => {
    writeProfileDraft({ housing_type: 'condo' })
    const merged = mergeProfileDraft({ has_kids: true })
    expect(merged).toEqual({ housing_type: 'condo', has_kids: true })
    expect(readProfileDraft()).toEqual({ housing_type: 'condo', has_kids: true })
  })

  it('mergeProfileDraft uses null to clear a field', () => {
    writeProfileDraft({ housing_type: 'hdb', has_kids: true })
    const merged = mergeProfileDraft({ housing_type: null })
    expect(merged).toEqual({ has_kids: true })
    expect(readProfileDraft()).toEqual({ has_kids: true })
  })

  it('mergeProfileDraft ignores undefined values', () => {
    writeProfileDraft({ housing_type: 'hdb' })
    const merged = mergeProfileDraft({ housing_type: undefined, has_kids: true })
    expect(merged).toEqual({ housing_type: 'hdb', has_kids: true })
  })
})

describe('completion percentage', () => {
  it('is 0 for an empty draft', () => {
    expect(computeCompletionPct({})).toBe(0)
  })

  it('reaches exactly 60% with just the three essentials', () => {
    // Mirrors the SQL trigger: 3 essentials × 20 pts = 60. This number is
    // load-bearing — the matching engine treats <60 as "essentials-only".
    expect(
      computeCompletionPct({
        housing_type: 'hdb',
        has_kids: false,
        other_pets: 'none',
      }),
    ).toBe(60)
  })

  it('caps at 100 when everything is answered', () => {
    expect(
      computeCompletionPct({
        housing_type: 'hdb',
        has_kids: true,
        other_pets: 'both',
        work_pattern: 'wfh',
        hours_alone: 4,
        experience: 'experienced',
        activity_level: 'moderate',
        budget_tier: 'medium',
        special_needs_ok: true,
        species_pref: ['dog'],
      }),
    ).toBe(100)
  })

  it('counts species_pref only when non-empty', () => {
    const withEmpty = computeCompletionPct({
      housing_type: 'hdb',
      has_kids: false,
      other_pets: 'none',
      species_pref: [],
    })
    const withOne = computeCompletionPct({
      housing_type: 'hdb',
      has_kids: false,
      other_pets: 'none',
      species_pref: ['dog'],
    })
    expect(withOne).toBeGreaterThan(withEmpty)
    expect(withEmpty).toBe(60)
  })

  it('treats has_kids=false as answered (not missing)', () => {
    // A boolean false is a valid answer — falsy checks would silently
    // miscount it as "not answered" and undercount completion.
    expect(computeCompletionPct({ has_kids: false })).toBe(20)
  })
})

describe('hasAllEssentials', () => {
  it('is false when any essential is missing', () => {
    expect(hasAllEssentials({})).toBe(false)
    expect(hasAllEssentials({ housing_type: 'hdb' })).toBe(false)
    expect(hasAllEssentials({ housing_type: 'hdb', has_kids: false })).toBe(false)
  })

  it('is true once all three essentials are answered', () => {
    expect(hasAllEssentials({ housing_type: 'hdb', has_kids: false, other_pets: 'none' })).toBe(
      true,
    )
  })
})

describe('onboarding state', () => {
  it('defaults to never-dismissed-never-completed', () => {
    expect(readOnboardingState()).toEqual({ dismissedAt: null, completedAt: null })
  })

  it('persists dismissal', () => {
    markOnboardingDismissed()
    const state = readOnboardingState()
    expect(state.dismissedAt).not.toBeNull()
    expect(state.completedAt).toBeNull()
  })

  it('persists completion separately from dismissal', () => {
    markOnboardingCompleted()
    const state = readOnboardingState()
    expect(state.dismissedAt).toBeNull()
    expect(state.completedAt).not.toBeNull()
  })
})

describe('shouldShowOnboardingOnFirstVisit', () => {
  // Phase 2.4 (reworked): the quiz appears on first visit, not after 5 swipes.
  // It is suppressed once the user has dismissed it (skip is sticky), once
  // they've completed it, or once essentials are already in the draft (e.g.
  // migrated from another device).

  it('shows on a truly fresh visit', () => {
    expect(shouldShowOnboardingOnFirstVisit({ dismissedAt: null, completedAt: null }, {})).toBe(
      true,
    )
  })

  it('stays hidden once skipped', () => {
    expect(
      shouldShowOnboardingOnFirstVisit(
        { dismissedAt: '2026-05-13T00:00:00Z', completedAt: null },
        {},
      ),
    ).toBe(false)
  })

  it('stays hidden once completed', () => {
    expect(
      shouldShowOnboardingOnFirstVisit(
        { dismissedAt: null, completedAt: '2026-05-13T00:00:00Z' },
        { housing_type: 'hdb', has_kids: false, other_pets: 'none' },
      ),
    ).toBe(false)
  })

  it('stays hidden when essentials are already in the draft', () => {
    // Covers the cross-device migration case where the draft is pre-populated
    // but onboarding state is fresh.
    expect(
      shouldShowOnboardingOnFirstVisit(
        { dismissedAt: null, completedAt: null },
        { housing_type: 'hdb', has_kids: false, other_pets: 'none' },
      ),
    ).toBe(false)
  })
})
