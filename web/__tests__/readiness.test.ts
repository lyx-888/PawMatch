import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSeenSnippetIds, markSnippetSeen } from '@/lib/readiness/state'
import { isLongTimer, pickSnippetForContext, SNIPPETS } from '@/lib/readiness/snippets'
import type { Pet } from '@/types/pet'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    source: 'spca',
    sourceId: 'x',
    sourceUrl: 'https://example.com',
    name: 'Rex',
    species: 'dog',
    breed: null,
    sex: null,
    ageMonths: null,
    size: null,
    weightKg: null,
    heightCm: null,
    hdbApproved: null,
    energyLevel: null,
    description: null,
    photoUrls: [],
    tags: [],
    lowConfidenceFields: [],
    status: 'available',
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('snippet catalog', () => {
  it('has six entries with unique ids', () => {
    expect(SNIPPETS).toHaveLength(6)
    const ids = new Set(SNIPPETS.map((s) => s.id))
    expect(ids.size).toBe(6)
  })

  it('every snippet has a learnSlug that matches /[a-z0-9-]+/', () => {
    for (const snippet of SNIPPETS) {
      expect(snippet.learnSlug).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe('isLongTimer', () => {
  const now = new Date('2026-05-12').getTime()

  it('flags pets listed 90+ days', () => {
    const pet = makePet({
      firstSeenAt: new Date(now - 100 * 86_400_000).toISOString(),
    })
    expect(isLongTimer(pet, now)).toBe(true)
  })

  it('flags senior pets (≥ 7y)', () => {
    expect(isLongTimer(makePet({ ageMonths: 7 * 12 }), now)).toBe(true)
    expect(isLongTimer(makePet({ ageMonths: 7 * 12 - 1 }), now)).toBe(false)
  })

  it('flags special-needs pets', () => {
    expect(isLongTimer(makePet({ tags: ['special_needs'] }), now)).toBe(true)
  })

  it('returns false for a fresh-listed young pet with no flags', () => {
    expect(
      isLongTimer(
        makePet({
          firstSeenAt: new Date(now - 7 * 86_400_000).toISOString(),
          ageMonths: 24,
        }),
        now,
      ),
    ).toBe(false)
  })
})

describe('pickSnippetForContext', () => {
  it('returns null when nothing matches', () => {
    expect(pickSnippetForContext({}, new Set())).toBeNull()
  })

  it('picks first_hdb_dog_viewed for an HDB-approved dog', () => {
    const snippet = pickSnippetForContext(
      { pet: makePet({ species: 'dog', hdbApproved: true }) },
      new Set(),
    )
    expect(snippet?.id).toBe('first_hdb_dog_viewed')
  })

  it('picks first_cat_viewed for a cat', () => {
    const snippet = pickSnippetForContext({ pet: makePet({ species: 'cat' }) }, new Set())
    expect(snippet?.id).toBe('first_cat_viewed')
  })

  it('picks first_special_needs_viewed when the pet has the tag', () => {
    const snippet = pickSnippetForContext({ pet: makePet({ tags: ['special_needs'] }) }, new Set())
    expect(snippet?.id).toBe('first_special_needs_viewed')
  })

  it('picks first_stretch_tier_viewed for a stretch match', () => {
    const snippet = pickSnippetForContext({ tier: 'stretch' }, new Set())
    expect(snippet?.id).toBe('first_stretch_tier_viewed')
  })

  it('picks third_favorite_added at favoritesCount >= 3', () => {
    const snippet = pickSnippetForContext({ favoritesCount: 3 }, new Set())
    expect(snippet?.id).toBe('third_favorite_added')
  })

  it('picks first_long_timer_favorited when hasLongTimerFavorite is true', () => {
    const snippet = pickSnippetForContext(
      { favoritesCount: 1, hasLongTimerFavorite: true },
      // Skip the third-favorite trigger since it wouldn't fire at count=1 anyway.
      new Set(),
    )
    expect(snippet?.id).toBe('first_long_timer_favorited')
  })

  it('skips snippets the user has already seen', () => {
    const snippet = pickSnippetForContext(
      { pet: makePet({ species: 'cat' }) },
      new Set(['first_cat_viewed']),
    )
    // No second-eligible snippet for a plain cat, so we get null rather
    // than re-suggesting the same one.
    expect(snippet).toBeNull()
  })

  it('prefers earlier snippets when multiple are eligible', () => {
    // An HDB dog that's also stretch matches both — the HDB snippet comes
    // first in the catalog and wins.
    const snippet = pickSnippetForContext(
      { pet: makePet({ species: 'dog', hdbApproved: true }), tier: 'stretch' },
      new Set(),
    )
    expect(snippet?.id).toBe('first_hdb_dog_viewed')
  })
})

describe('seen-snippet storage', () => {
  it('round-trips a seen id', () => {
    markSnippetSeen('first_cat_viewed')
    expect(getSeenSnippetIds()).toContain('first_cat_viewed')
  })

  it('is idempotent', () => {
    markSnippetSeen('first_cat_viewed')
    markSnippetSeen('first_cat_viewed')
    expect(getSeenSnippetIds().filter((id) => id === 'first_cat_viewed')).toHaveLength(1)
  })

  it('survives a corrupted blob', () => {
    window.localStorage.setItem('pawmatch_readiness_seen', '{not json')
    expect(getSeenSnippetIds()).toEqual([])
    markSnippetSeen('first_cat_viewed')
    expect(getSeenSnippetIds()).toEqual(['first_cat_viewed'])
  })
})
