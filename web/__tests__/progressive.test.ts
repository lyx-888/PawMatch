import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeProfileDraft } from '@/lib/onboarding/profile-draft'
import {
  PROGRESSIVE_QUESTIONS,
  answerProgressive,
  markProgressiveAsked,
  markProgressiveDismissed,
  readProgressiveState,
  type ProgressiveContext,
} from '@/lib/onboarding/progressive'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

// Tiny helper that looks up the canonical question definition by id, so
// tests don't have to track registry order.
function question(id: string) {
  const q = PROGRESSIVE_QUESTIONS.find((x) => x.id === id)
  if (!q) throw new Error(`question ${id} not in registry`)
  return q
}

const NO_CONTEXT: ProgressiveContext = { favoritesCount: 0 }

describe('PROGRESSIVE_QUESTIONS registry', () => {
  it('covers all six questions per spec §2.2', () => {
    const ids = PROGRESSIVE_QUESTIONS.map((q) => q.id).sort()
    expect(ids).toEqual([
      'activity_level',
      'budget_tier',
      'experience',
      'mesh_status',
      'special_needs_ok',
      'work_pattern',
    ])
  })

  it('each question has at least two options', () => {
    for (const q of PROGRESSIVE_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('shouldTrigger predicates', () => {
  it('mesh_status fires only when viewing a cat and not already set', () => {
    const q = question('mesh_status')
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetSpecies: 'cat' })).toBe(true)
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetSpecies: 'dog' })).toBe(false)
    expect(q.shouldTrigger({}, NO_CONTEXT)).toBe(false)
    expect(
      q.shouldTrigger({ mesh_status: 'meshed' }, { ...NO_CONTEXT, viewingPetSpecies: 'cat' }),
    ).toBe(false)
  })

  it('special_needs_ok fires only on a special-needs pet view', () => {
    const q = question('special_needs_ok')
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetIsSpecialNeeds: true })).toBe(true)
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetIsSpecialNeeds: false })).toBe(false)
    expect(
      q.shouldTrigger(
        { special_needs_ok: true },
        { ...NO_CONTEXT, viewingPetIsSpecialNeeds: true },
      ),
    ).toBe(false)
  })

  it('activity_level is dormant — only fires on first Stretch tier shown', () => {
    const q = question('activity_level')
    expect(q.shouldTrigger({}, NO_CONTEXT)).toBe(false)
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetTier: 'great' })).toBe(false)
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, viewingPetTier: 'stretch' })).toBe(true)
  })

  it('work_pattern fires from the first favorite onward', () => {
    const q = question('work_pattern')
    expect(q.shouldTrigger({}, { favoritesCount: 0 })).toBe(false)
    expect(q.shouldTrigger({}, { favoritesCount: 1 })).toBe(true)
    expect(q.shouldTrigger({}, { favoritesCount: 10 })).toBe(true)
    expect(q.shouldTrigger({ work_pattern: 'wfh' }, { favoritesCount: 5 })).toBe(false)
  })

  it('experience fires from the third favorite onward', () => {
    const q = question('experience')
    expect(q.shouldTrigger({}, { favoritesCount: 2 })).toBe(false)
    expect(q.shouldTrigger({}, { favoritesCount: 3 })).toBe(true)
  })

  it('budget_tier is dormant — only fires after saving a search', () => {
    const q = question('budget_tier')
    expect(q.shouldTrigger({}, NO_CONTEXT)).toBe(false)
    expect(q.shouldTrigger({}, { ...NO_CONTEXT, justSavedSearch: true })).toBe(true)
  })
})

describe('progressive state lifecycle', () => {
  it('markProgressiveAsked is idempotent', () => {
    markProgressiveAsked('work_pattern')
    const first = readProgressiveState().work_pattern?.askedAt
    markProgressiveAsked('work_pattern')
    const second = readProgressiveState().work_pattern?.askedAt
    // Re-asking must not reset the timestamp — that would let the same
    // question re-fire forever.
    expect(second).toBe(first)
  })

  it('answer + dismiss are recorded separately', () => {
    markProgressiveAsked('experience')
    markProgressiveDismissed('experience')
    const state = readProgressiveState()
    expect(state.experience?.dismissedAt).toBeDefined()
    expect(state.experience?.answeredAt).toBeUndefined()
  })

  it('answerProgressive writes both the draft and the state', () => {
    answerProgressive({ id: 'work_pattern', value: 'wfh' })
    const state = readProgressiveState()
    expect(state.work_pattern?.answeredAt).toBeDefined()
    // mergeProfileDraft should have persisted the answer too.
    const draft = JSON.parse(window.localStorage.getItem('pawmatch_profile_draft') ?? '{}')
    expect(draft.work_pattern).toBe('wfh')
  })

  it('writeProfileDraft path is preserved across operations', () => {
    writeProfileDraft({ housing_type: 'hdb' })
    answerProgressive({ id: 'work_pattern', value: 'office' })
    const draft = JSON.parse(window.localStorage.getItem('pawmatch_profile_draft') ?? '{}')
    expect(draft.housing_type).toBe('hdb')
    expect(draft.work_pattern).toBe('office')
  })
})
