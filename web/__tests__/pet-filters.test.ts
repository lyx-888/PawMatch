import { describe, expect, it } from 'vitest'

import { parsePetQuery } from '@/lib/api/pet-filters'
import { DEFAULT_LIMIT, resolveListedSince } from '@/lib/db/pets'

function params(input: Record<string, string | string[]>): URLSearchParams {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) v.forEach((item) => usp.append(k, item))
    else usp.set(k, v)
  }
  return usp
}

describe('parsePetQuery', () => {
  it('applies default limit when omitted', () => {
    const filters = parsePetQuery(params({}))
    expect(filters.limit).toBe(DEFAULT_LIMIT)
    expect(filters.species).toBeUndefined()
  })

  it('parses single-value enums', () => {
    const filters = parsePetQuery(params({ species: 'dog', size: 'medium' }))
    expect(filters.species).toBe('dog')
    expect(filters.size).toBe('medium')
  })

  it('rejects invalid species', () => {
    expect(() => parsePetQuery(params({ species: 'unicorn' }))).toThrowError()
  })

  it('clamps limit to allowed range', () => {
    expect(() => parsePetQuery(params({ limit: '500' }))).toThrowError()
    expect(() => parsePetQuery(params({ limit: '0' }))).toThrowError()
  })

  it('reads tags from a comma-separated string', () => {
    const filters = parsePetQuery(params({ tags: 'good_with_kids,house_trained' }))
    expect(filters.tags).toEqual(['good_with_kids', 'house_trained'])
  })

  it('reads tags from a repeated query param', () => {
    const filters = parsePetQuery(params({ tags: ['good_with_kids', 'senior'] }))
    expect(filters.tags).toEqual(['good_with_kids', 'senior'])
  })

  it('coerces hdb_approved to boolean', () => {
    expect(parsePetQuery(params({ hdb_approved: 'true' })).hdbApproved).toBe(true)
    expect(parsePetQuery(params({ hdb_approved: 'false' })).hdbApproved).toBe(false)
    expect(parsePetQuery(params({})).hdbApproved).toBeUndefined()
  })

  it('passes through exclude ids', () => {
    const filters = parsePetQuery(params({ exclude: 'a,b,c' }))
    expect(filters.excludeIds).toEqual(['a', 'b', 'c'])
  })
})

describe('resolveListedSince', () => {
  it('parses 7d relative durations', () => {
    const iso = resolveListedSince('7d')
    expect(iso).not.toBeNull()
    const diff = Date.now() - new Date(iso!).getTime()
    expect(diff).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000)
    expect(diff).toBeLessThanOrEqual(7 * 86_400_000 + 1000)
  })

  it('parses 24h relative durations', () => {
    const iso = resolveListedSince('24h')
    expect(iso).not.toBeNull()
    const diff = Date.now() - new Date(iso!).getTime()
    expect(diff).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000)
  })

  it('accepts ISO timestamps', () => {
    const iso = resolveListedSince('2026-01-01T00:00:00Z')
    expect(iso).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns null for garbage', () => {
    expect(resolveListedSince('foo')).toBeNull()
  })
})
