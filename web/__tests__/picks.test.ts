import { describe, expect, it } from 'vitest'

import { composePicks, isLongTimerMeta, isNewMeta, type PickJoinedRow } from '@/lib/inngest/picks'

const NOW = new Date('2026-05-12T00:00:00Z').getTime()

function days(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString()
}

function row(
  id: string,
  tier: PickJoinedRow['tier'],
  score: number,
  overrides: Partial<PickJoinedRow['pets']> = {},
): PickJoinedRow {
  return {
    pet_id: id,
    tier,
    score,
    pets: {
      id,
      first_seen_at: days(30),
      age_months: 24,
      tags: [],
      ...overrides,
    },
  }
}

describe('isLongTimerMeta', () => {
  it('flags pets listed 90+ days', () => {
    expect(
      isLongTimerMeta({ id: 'a', first_seen_at: days(100), age_months: 12, tags: [] }, NOW),
    ).toBe(true)
  })
  it('flags senior pets', () => {
    expect(
      isLongTimerMeta({ id: 'a', first_seen_at: days(10), age_months: 7 * 12, tags: [] }, NOW),
    ).toBe(true)
  })
  it('flags special-needs pets', () => {
    expect(
      isLongTimerMeta(
        { id: 'a', first_seen_at: days(10), age_months: 24, tags: ['special_needs'] },
        NOW,
      ),
    ).toBe(true)
  })
  it('skips fresh young pets without flags', () => {
    expect(
      isLongTimerMeta({ id: 'a', first_seen_at: days(5), age_months: 24, tags: [] }, NOW),
    ).toBe(false)
  })
})

describe('isNewMeta', () => {
  it('flags pets within the 7-day window', () => {
    expect(isNewMeta({ id: 'a', first_seen_at: days(3), age_months: null, tags: null }, NOW)).toBe(
      true,
    )
  })
  it('rejects pets older than 7 days', () => {
    expect(isNewMeta({ id: 'a', first_seen_at: days(8), age_months: null, tags: null }, NOW)).toBe(
      false,
    )
  })
})

describe('composePicks', () => {
  it('returns at most 5 ids', () => {
    const eligible = Array.from({ length: 10 }, (_, i) => row(`p${i}`, 'great', 95 - i))
    expect(composePicks(eligible, NOW)).toHaveLength(5)
  })

  it('fills the top-tier slot first', () => {
    const eligible = [
      row('top-1', 'great', 90),
      row('top-2', 'good', 70),
      row('stretch-1', 'stretch', 50),
    ]
    const picks = composePicks(eligible, NOW)
    expect(picks[0]).toBe('top-1')
    expect(picks[1]).toBe('top-2')
  })

  it('picks a long-timer scoring good before stretch alternatives', () => {
    const eligible = [
      row('young-great', 'great', 90, { first_seen_at: days(5) }),
      row('lt-good', 'good', 70, { first_seen_at: days(100) }),
      row('stretch-young', 'stretch', 40, { first_seen_at: days(5) }),
    ]
    const picks = composePicks(eligible, NOW)
    // young-great is grabbed by the top-tier slot; the long-timer slot
    // then claims lt-good ahead of stretch alternatives.
    expect(picks[0]).toBe('young-great')
    expect(picks).toContain('lt-good')
    // Padding fills the remaining slots in score-desc order; stretch-young
    // gets picked because the eligible set is small.
  })

  it('fills wildcard slot from newcomers', () => {
    const eligible = [
      row('old-great', 'great', 95, { first_seen_at: days(60) }),
      row('new-stretch', 'stretch', 50, { first_seen_at: days(2) }),
    ]
    const picks = composePicks(eligible, NOW)
    expect(picks).toContain('new-stretch')
  })

  it('pads from eligible when slot groups are short', () => {
    // No long-timers, no newcomers — should still pad to 5 from eligible.
    const eligible = [
      row('a', 'great', 95),
      row('b', 'good', 80),
      row('c', 'good', 70),
      row('d', 'good', 65),
      row('e', 'stretch', 50),
      row('f', 'stretch', 40),
    ]
    const picks = composePicks(eligible, NOW)
    expect(picks).toHaveLength(5)
    // Top scorers come first since the top-tier filter ran first.
    expect(picks.slice(0, 2)).toEqual(['a', 'b'])
  })

  it('never duplicates a pet across slots', () => {
    // A long-timer that also scores great would otherwise be picked twice.
    const eligible = [
      row('lt-great', 'great', 95, { first_seen_at: days(100) }),
      row('reg-good', 'good', 70),
      row('newer', 'stretch', 50, { first_seen_at: days(3) }),
    ]
    const picks = composePicks(eligible, NOW)
    expect(new Set(picks).size).toBe(picks.length)
  })
})
