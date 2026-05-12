import { describe, expect, it } from 'vitest'

import { petToMatchPet, profileDraftToMatchProfile } from '@/lib/matching/adapters'
import type { ProfileDraft } from '@/lib/onboarding/profile-draft'
import type { Pet } from '@/types/pet'

const PET: Pet = {
  id: 'p1',
  source: 'spca',
  sourceId: 'abc',
  sourceUrl: 'https://example.com',
  name: 'Mochi',
  species: 'dog',
  breed: 'Maltese',
  sex: 'female',
  ageMonths: 24,
  size: 'small',
  weightKg: 5,
  heightCm: 30,
  hdbApproved: true,
  energyLevel: 'medium',
  description: 'A small dog.',
  photoUrls: [],
  tags: ['good_with_kids'],
  lowConfidenceFields: ['hdb_approved'],
  status: 'available',
  firstSeenAt: '2026-05-01T00:00:00Z',
  lastSeenAt: '2026-05-01T00:00:00Z',
}

describe('petToMatchPet', () => {
  it('maps camelCase Pet to snake_case MatchPet', () => {
    const mp = petToMatchPet(PET)
    expect(mp).toEqual({
      id: 'p1',
      name: 'Mochi',
      species: 'dog',
      breed: 'Maltese',
      weight_kg: 5,
      height_cm: 30,
      size: 'small',
      energy_level: 'medium',
      hdb_approved: true,
      tags: ['good_with_kids'],
      low_confidence_fields: ['hdb_approved'],
    })
  })

  it('preserves low_confidence_fields so the engine can honour §2.1.4', () => {
    const mp = petToMatchPet(PET)
    expect(mp.low_confidence_fields).toContain('hdb_approved')
  })
})

describe('profileDraftToMatchProfile', () => {
  it('computes completion_pct from the draft', () => {
    const draft: ProfileDraft = {
      housing_type: 'hdb',
      has_kids: false,
      other_pets: 'none',
    }
    const mp = profileDraftToMatchProfile(draft)
    expect(mp.completion_pct).toBe(60) // 3 essentials × 20
    expect(mp.housing_type).toBe('hdb')
    expect(mp.has_kids).toBe(false)
    expect(mp.other_pets).toBe('none')
  })

  it('treats an empty draft as completion_pct 0', () => {
    const mp = profileDraftToMatchProfile({})
    expect(mp.completion_pct).toBe(0)
  })

  it('passes through progressive fields unchanged', () => {
    const mp = profileDraftToMatchProfile({
      housing_type: 'condo',
      has_kids: false,
      other_pets: 'none',
      activity_level: 'moderate',
      experience: 'experienced',
      special_needs_ok: true,
      mesh_status: 'meshed',
    })
    expect(mp.activity_level).toBe('moderate')
    expect(mp.experience).toBe('experienced')
    expect(mp.special_needs_ok).toBe(true)
    expect(mp.mesh_status).toBe('meshed')
  })
})
