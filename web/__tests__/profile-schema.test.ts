import { describe, expect, it } from 'vitest'

import { ProfilePatchSchema } from '@/types/profile'

describe('ProfilePatchSchema', () => {
  it('accepts a valid full payload', () => {
    const result = ProfilePatchSchema.safeParse({
      housing_type: 'hdb',
      hdb_block_type: '4-room',
      mesh_status: 'meshed',
      has_kids: true,
      kid_ages: [3, 7],
      other_pets: 'cats',
      work_pattern: 'wfh',
      hours_alone: 4,
      experience: 'experienced',
      activity_level: 'moderate',
      budget_tier: 'medium',
      special_needs_ok: true,
      species_pref: ['dog', 'cat'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a minimal partial payload (just one essential)', () => {
    const result = ProfilePatchSchema.safeParse({ housing_type: 'hdb' })
    expect(result.success).toBe(true)
  })

  it('accepts explicit nulls so a client can clear a field', () => {
    const result = ProfilePatchSchema.safeParse({
      housing_type: null,
      has_kids: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown keys (strict — guards against client typos)', () => {
    const result = ProfilePatchSchema.safeParse({
      housing_type: 'hdb',
      // Typo: should be `has_kids`. Without `.strict()` this would silently
      // no-op on the server.
      haskids: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects values outside the enum for housing_type', () => {
    const result = ProfilePatchSchema.safeParse({ housing_type: 'mansion' })
    expect(result.success).toBe(false)
  })

  it('rejects kid_ages when has_kids is false', () => {
    const result = ProfilePatchSchema.safeParse({
      has_kids: false,
      kid_ages: [5],
    })
    expect(result.success).toBe(false)
  })

  it('allows kid_ages when has_kids is true', () => {
    const result = ProfilePatchSchema.safeParse({
      has_kids: true,
      kid_ages: [5, 10],
    })
    expect(result.success).toBe(true)
  })

  it('allows empty kid_ages regardless of has_kids', () => {
    const result = ProfilePatchSchema.safeParse({
      has_kids: false,
      kid_ages: [],
    })
    expect(result.success).toBe(true)
  })

  it('caps kid_ages length and value bounds', () => {
    // Too many kids — guards against a runaway client.
    const tooMany = ProfilePatchSchema.safeParse({
      has_kids: true,
      kid_ages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    })
    expect(tooMany.success).toBe(false)

    // Age out of plausible range.
    const tooOld = ProfilePatchSchema.safeParse({
      has_kids: true,
      kid_ages: [50],
    })
    expect(tooOld.success).toBe(false)
  })

  it('rejects hours_alone outside 0..24', () => {
    expect(ProfilePatchSchema.safeParse({ hours_alone: -1 }).success).toBe(false)
    expect(ProfilePatchSchema.safeParse({ hours_alone: 25 }).success).toBe(false)
    expect(ProfilePatchSchema.safeParse({ hours_alone: 8 }).success).toBe(true)
  })

  it('rejects unknown species in species_pref', () => {
    const result = ProfilePatchSchema.safeParse({
      species_pref: ['dog', 'hamster'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects attempts to set server-managed fields', () => {
    // completion_pct is computed by a trigger; updated_at by another trigger.
    // Clients should not be able to spoof either.
    const completion = ProfilePatchSchema.safeParse({ completion_pct: 100 })
    expect(completion.success).toBe(false)
    const updated = ProfilePatchSchema.safeParse({ updated_at: 'now' })
    expect(updated.success).toBe(false)
  })
})
