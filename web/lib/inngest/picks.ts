// "Possibly Yours" daily picks generator per docs/requirements §2.4.
//
// For each active user, picks 5 pets following the mix rules:
//   * up to 2 best-tier matches not yet swiped
//   * up to 2 long-timer matches scoring ≥ good
//   * 1 wildcard from "new in last 7 days"
//   * pad any empty slot from the next-best-tier candidates
//
// Pets shown in the user's picks within the last 14 days are excluded
// unless they're a brand-new top match (i.e. didn't exist 14 days ago).

import { createServerClient } from '@/lib/db/client'

export const ACTIVE_WINDOW_DAYS = 14
export const LONG_TIMER_DAYS = 90
export const SENIOR_AGE_MONTHS = 7 * 12
export const NEW_WINDOW_DAYS = 7
export const PICKS_PER_USER = 5
export const SLOT_TOP_TIER = 2
export const SLOT_LONG_TIMER = 2
export const SLOT_WILDCARD = 1

export type PickPetMeta = {
  id: string
  first_seen_at: string
  age_months: number | null
  tags: string[] | null
}

export type PickScoreRow = {
  pet_id: string
  score: number
  tier: 'great' | 'good' | 'stretch' | 'hard_fail'
}

export type PickJoinedRow = PickScoreRow & { pets: PickPetMeta }

export function isLongTimerMeta(pet: PickPetMeta, now: number): boolean {
  if (now - new Date(pet.first_seen_at).getTime() >= LONG_TIMER_DAYS * 86_400_000) return true
  if (pet.age_months !== null && pet.age_months >= SENIOR_AGE_MONTHS) return true
  if ((pet.tags ?? []).includes('special_needs')) return true
  return false
}

export function isNewMeta(pet: PickPetMeta, now: number): boolean {
  return now - new Date(pet.first_seen_at).getTime() <= NEW_WINDOW_DAYS * 86_400_000
}

/**
 * Pure composition logic for the daily picks per spec §2.4. Receives the
 * eligible candidate set (already filtered for swiped / recently-shown /
 * stale) in score-descending order, and slot-fills:
 *   * up to 2 best-tier matches
 *   * up to 2 long-timer matches scoring ≥ good
 *   * 1 newcomer (first seen ≤ 7 days ago)
 *   * pads from the eligible set to 5
 */
export function composePicks(eligible: PickJoinedRow[], now: number): string[] {
  const used = new Set<string>()
  const picks: string[] = []

  function take(candidates: PickJoinedRow[], slots: number): void {
    for (const cand of candidates) {
      if (picks.length >= PICKS_PER_USER) break
      if (slots <= 0) break
      if (used.has(cand.pet_id)) continue
      used.add(cand.pet_id)
      picks.push(cand.pet_id)
      slots -= 1
    }
  }

  const topTier = eligible.filter((r) => r.tier === 'great' || r.tier === 'good')
  take(topTier, SLOT_TOP_TIER)

  const longTimers = eligible.filter(
    (r) => isLongTimerMeta(r.pets, now) && (r.tier === 'great' || r.tier === 'good'),
  )
  take(longTimers, SLOT_LONG_TIMER)

  const newcomers = eligible.filter((r) => isNewMeta(r.pets, now))
  take(newcomers, SLOT_WILDCARD)

  take(eligible, PICKS_PER_USER - picks.length)
  return picks
}

/**
 * Generate today's picks for every user active in the last 14 days.
 *
 * Returns a summary so the Inngest run logs are useful: `users` is the
 * number processed, `inserted` the number whose picks row was upserted.
 */
export async function generateDailyPicks(): Promise<{ users: number; inserted: number }> {
  const client = createServerClient()
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const since = new Date(now - ACTIVE_WINDOW_DAYS * 86_400_000).toISOString()

  const { data: activeUsers, error: usersErr } = await client
    .from('users')
    .select('id')
    .gte('last_active_at', since)
  if (usersErr) throw new Error(`active users read failed: ${usersErr.message}`)
  const userIds = ((activeUsers ?? []) as { id: string }[]).map((u) => u.id)
  if (userIds.length === 0) return { users: 0, inserted: 0 }

  let inserted = 0
  for (const userId of userIds) {
    const picks = await pickForUser(userId, now)
    if (picks.length === 0) continue
    const { error } = await client
      .from('daily_picks')
      .upsert(
        { user_id: userId, date: today, pet_ids: picks, generated_at: new Date(now).toISOString() },
        { onConflict: 'user_id,date' },
      )
    if (error) throw new Error(`daily_picks upsert failed for ${userId}: ${error.message}`)
    inserted += 1
  }

  return { users: userIds.length, inserted }
}

async function pickForUser(userId: string, now: number): Promise<string[]> {
  const client = createServerClient()
  const fourteenDaysAgo = new Date(now - ACTIVE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

  // Pets the user has already swiped (favorited or passed).
  const [favRes, passRes] = await Promise.all([
    client.from('favorites').select('pet_id').eq('user_id', userId),
    client.from('passes').select('pet_id').eq('user_id', userId),
  ])
  if (favRes.error) throw new Error(`favorites read failed: ${favRes.error.message}`)
  if (passRes.error) throw new Error(`passes read failed: ${passRes.error.message}`)
  const swiped = new Set<string>([
    ...((favRes.data ?? []) as { pet_id: string }[]).map((r) => r.pet_id),
    ...((passRes.data ?? []) as { pet_id: string }[]).map((r) => r.pet_id),
  ])

  // Pets shown in the user's picks in the last 14 days. Stored as a
  // flattened set so we can decide which need the "new top match"
  // exception below.
  const { data: recentPicks, error: pickErr } = await client
    .from('daily_picks')
    .select('pet_ids, date')
    .eq('user_id', userId)
    .gte('date', fourteenDaysAgo)
  if (pickErr) throw new Error(`recent picks read failed: ${pickErr.message}`)
  const recentlyShown = new Set<string>()
  for (const row of (recentPicks ?? []) as { pet_ids: string[] }[]) {
    for (const id of row.pet_ids) recentlyShown.add(id)
  }

  // Fresh match scores for this user, joined with pet metadata so we can
  // apply the long-timer / new-pet filters in JS. Cap the join to a
  // reasonable size — top 200 by score is plenty of headroom for 5 picks
  // with three filters applied.
  const { data: rows, error: rowsErr } = await client
    .from('match_scores')
    .select('pet_id, score, tier, pets!inner(id, first_seen_at, age_months, tags, status)')
    .eq('user_id', userId)
    .eq('stale', false)
    .in('tier', ['great', 'good', 'stretch'])
    .in('pets.status', ['available', 'pending'])
    .order('score', { ascending: false })
    .limit(200)
  if (rowsErr) throw new Error(`match_scores read failed: ${rowsErr.message}`)

  const joined = (rows ?? []) as unknown as PickJoinedRow[]

  // A pet is reusable from a recent pick only if it's a "new top match" —
  // newly seen by us within the new-pet window AND scores great.
  const eligible = joined.filter((r) => {
    if (swiped.has(r.pet_id)) return false
    if (!recentlyShown.has(r.pet_id)) return true
    return r.tier === 'great' && isNewMeta(r.pets, now)
  })

  return composePicks(eligible, now)
}
