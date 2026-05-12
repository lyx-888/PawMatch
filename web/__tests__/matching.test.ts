import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  compatibilityScore,
  energyFitScore,
  experienceFitScore,
  housingFitScore,
  score,
  sizeFitScore,
  specialNeedsScore,
} from '@/lib/matching/score'
import type { MatchPet, MatchProfile, Tier } from '@/lib/matching/types'

// Shared fixture file. The repo root sits two levels up from this test file
// in source layout, and one level up from cwd when vitest runs. Both
// strategies are tried so the test works under both dev and CI.
type FixtureExpected = {
  tier: Tier
  score_min: number
  score_max: number
  hard_fails: string[]
}

type Fixture = {
  id: string
  rationale: string
  profile: MatchProfile
  pet: MatchPet
  expected: FixtureExpected
}

function loadFixtures(): Fixture[] {
  // vitest runs from the `web/` dir. Walk up one level for the shared file.
  const path = resolve(process.cwd(), '..', 'tests', 'matching-fixtures.json')
  const raw = readFileSync(path, 'utf8')
  const json = JSON.parse(raw) as { fixtures: Fixture[] }
  return json.fixtures
}

const FIXTURES = loadFixtures()

describe('fixture file', () => {
  it('contains at least 30 cases per requirements §2.6', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(30)
  })

  it('ids are unique', () => {
    const ids = FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every fixture has a rationale', () => {
    for (const f of FIXTURES) {
      expect(f.rationale.length, `fixture ${f.id} missing rationale`).toBeGreaterThan(20)
    }
  })
})

describe('score(profile, pet) — fixture-driven calibration', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: ${fixture.rationale.slice(0, 80)}`, () => {
      const result = score(fixture.profile, fixture.pet)

      expect(result.tier, `${fixture.id} tier`).toBe(fixture.expected.tier)
      expect(result.score, `${fixture.id} score lower bound`).toBeGreaterThanOrEqual(
        fixture.expected.score_min,
      )
      expect(result.score, `${fixture.id} score upper bound`).toBeLessThanOrEqual(
        fixture.expected.score_max,
      )
      expect(result.hard_fails.slice().sort(), `${fixture.id} hard_fails`).toEqual(
        fixture.expected.hard_fails.slice().sort(),
      )
    })
  }
})

// --- Sub-function spot checks --------------------------------------------
//
// The fixture-driven tests above catch behaviour drift at the composite
// level. These spot checks pin the sub-function semantics directly so a
// regression in (say) energy_fit doesn't show up only as a confusing
// tier-level failure.

const BASE_PROFILE: MatchProfile = {
  housing_type: 'hdb',
  has_kids: false,
  other_pets: 'none',
  experience: 'some',
  activity_level: 'moderate',
  special_needs_ok: false,
  completion_pct: 100,
}

function pet(overrides: Partial<MatchPet> = {}): MatchPet {
  return {
    id: 'p',
    name: 'Test',
    species: 'dog',
    tags: [],
    ...overrides,
  }
}

describe('housingFitScore', () => {
  it('HDB + small ADORE dog = 1.0', () => {
    expect(
      housingFitScore(BASE_PROFILE, pet({ breed: 'Maltese', weight_kg: 4, size: 'small' })),
    ).toBe(1.0)
  })

  it('HDB + Singapore Special within 15kg = 1.0', () => {
    expect(
      housingFitScore(
        BASE_PROFILE,
        pet({ breed: 'Singapore Special', weight_kg: 13, size: 'medium' }),
      ),
    ).toBe(1.0)
  })

  it('HDB + cat with meshed windows = 1.0', () => {
    expect(
      housingFitScore({ ...BASE_PROFILE, mesh_status: 'meshed' }, pet({ species: 'cat' })),
    ).toBe(1.0)
  })

  it('HDB + cat with unspecified mesh = 0.0', () => {
    expect(housingFitScore(BASE_PROFILE, pet({ species: 'cat' }))).toBe(0.0)
  })

  it('low-confidence hdb_approved=true is treated as null', () => {
    // The pet says it's HDB-approved but the LLM was uncertain. The rule
    // must NOT honour the value — falling back to weight + ADORE check.
    expect(
      housingFitScore(
        BASE_PROFILE,
        pet({
          breed: 'unknown',
          weight_kg: 15,
          size: 'medium',
          hdb_approved: true,
          low_confidence_fields: ['hdb_approved'],
        }),
      ),
    ).toBe(0.0)
  })

  it('no housing_type → 0', () => {
    expect(
      housingFitScore(
        { ...BASE_PROFILE, housing_type: null },
        pet({ weight_kg: 8, size: 'small' }),
      ),
    ).toBe(0.0)
  })
})

describe('sizeFitScore', () => {
  it.each([
    ['hdb', 'small', 1.0],
    ['hdb', 'medium', 0.0],
    ['hdb', 'large', -1.0],
    ['condo', 'small', 0.5],
    ['condo', 'medium', 1.0],
    ['condo', 'large', 0.5],
    ['landed', 'small', 1.0],
    ['landed', 'medium', 1.0],
    ['landed', 'large', 1.0],
  ] as const)('%s + %s dog = %s', (housing, size, expected) => {
    expect(sizeFitScore({ ...BASE_PROFILE, housing_type: housing }, pet({ size }))).toBe(expected)
  })

  it('cats always score +1', () => {
    expect(sizeFitScore(BASE_PROFILE, pet({ species: 'cat' }))).toBe(1.0)
  })

  it('unknown size = 0', () => {
    expect(sizeFitScore(BASE_PROFILE, pet({ size: null }))).toBe(0.0)
  })
})

describe('energyFitScore', () => {
  it.each([
    ['sedentary', 'low', 1.0],
    ['sedentary', 'medium', 0.0],
    ['sedentary', 'high', -1.0],
    ['moderate', 'medium', 1.0],
    ['moderate', 'low', 0.3],
    ['moderate', 'high', 0.3],
    ['very_active', 'high', 1.0],
    ['very_active', 'medium', 0.5],
    ['very_active', 'low', -0.3],
  ] as const)('%s user + %s pet = %s', (activity, energy, expected) => {
    expect(
      energyFitScore({ ...BASE_PROFILE, activity_level: activity }, pet({ energy_level: energy })),
    ).toBe(expected)
  })

  it('unknown activity or energy = 0', () => {
    expect(
      energyFitScore({ ...BASE_PROFILE, activity_level: null }, pet({ energy_level: 'high' })),
    ).toBe(0.0)
    expect(energyFitScore(BASE_PROFILE, pet({ energy_level: null }))).toBe(0.0)
  })
})

describe('experienceFitScore', () => {
  it('first-time + special_needs = -1', () => {
    expect(
      experienceFitScore(
        { ...BASE_PROFILE, experience: 'first_time' },
        pet({ tags: ['special_needs'] }),
      ),
    ).toBe(-1.0)
  })

  it('first-time + shy = -1', () => {
    expect(
      experienceFitScore({ ...BASE_PROFILE, experience: 'first_time' }, pet({ tags: ['shy'] })),
    ).toBe(-1.0)
  })

  it('first-time + first_time_friendly = +1', () => {
    expect(
      experienceFitScore(
        { ...BASE_PROFILE, experience: 'first_time' },
        pet({ tags: ['first_time_friendly'] }),
      ),
    ).toBe(1.0)
  })

  it('experienced + anything = +0.5', () => {
    expect(
      experienceFitScore(
        { ...BASE_PROFILE, experience: 'experienced' },
        pet({ tags: ['special_needs'] }),
      ),
    ).toBe(0.5)
  })
})

describe('compatibilityScore', () => {
  it('zero traits → 0', () => {
    expect(
      compatibilityScore(
        { ...BASE_PROFILE, has_kids: false, other_pets: 'none' },
        pet({ tags: ['good_with_kids'] }),
      ),
    ).toBe(0.0)
  })

  it('one trait positive = +0.4', () => {
    expect(
      compatibilityScore({ ...BASE_PROFILE, has_kids: true }, pet({ tags: ['good_with_kids'] })),
    ).toBeCloseTo(0.4)
  })

  it('three traits all positive caps at +1.0', () => {
    expect(
      compatibilityScore(
        { ...BASE_PROFILE, has_kids: true, other_pets: 'both' },
        pet({ tags: ['good_with_kids', 'good_with_cats', 'good_with_dogs'] }),
      ),
    ).toBeCloseTo(1.0)
  })

  it('unknown penalty caps at -0.4', () => {
    expect(
      compatibilityScore(
        { ...BASE_PROFILE, has_kids: true, other_pets: 'both' },
        pet({ tags: [] }),
      ),
    ).toBeCloseTo(-0.4)
  })

  it('any incompatible tag → -1', () => {
    expect(
      compatibilityScore(
        { ...BASE_PROFILE, has_kids: true },
        pet({ tags: ['not_good_with_kids'] }),
      ),
    ).toBe(-1.0)
  })
})

describe('specialNeedsScore', () => {
  it('pet is special-needs + user says yes = +1', () => {
    expect(
      specialNeedsScore(
        { ...BASE_PROFILE, special_needs_ok: true },
        pet({ tags: ['special_needs'] }),
      ),
    ).toBe(1.0)
  })

  it('pet is special-needs + user says no = -1', () => {
    expect(
      specialNeedsScore(
        { ...BASE_PROFILE, special_needs_ok: false },
        pet({ tags: ['special_needs'] }),
      ),
    ).toBe(-1.0)
  })

  it('pet not special-needs → 0', () => {
    expect(specialNeedsScore(BASE_PROFILE, pet({ tags: [] }))).toBe(0.0)
  })

  it('special_needs_ok unset → 0', () => {
    expect(
      specialNeedsScore(
        { ...BASE_PROFILE, special_needs_ok: null },
        pet({ tags: ['special_needs'] }),
      ),
    ).toBe(0.0)
  })
})

describe('weights_version is exported and stable', () => {
  it('stays at the declared version', () => {
    // Pin so a bump to the version is a deliberate edit, not a silent
    // change buried in a refactor.
    const result = score({ ...BASE_PROFILE }, pet({ weight_kg: 5, size: 'small' }))
    expect(result.weights_version).toBe('1.0.0')
  })
})

describe('reason ordering', () => {
  it('hard-fail reasons appear first', () => {
    const result = score(
      { ...BASE_PROFILE },
      pet({ breed: 'Labrador Retriever', weight_kg: 25, size: 'large' }),
    )
    expect(result.hard_fails).toContain('housing_fit_fail')
    expect(result.reasons[0].template).toBe('housing_fit_fail')
    expect(result.reasons[0].kind).toBe('risk')
  })
})
