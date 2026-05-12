// Shared helpers used by the Inngest recompute functions. All DB access
// is through the service-role server client — these run on the server only.

import { createServerClient } from '@/lib/db/client'
import {
  petToMatchPet,
  profileRowToMatchProfile,
  type ProfileRowForMatching,
} from '@/lib/matching/adapters'
import { score, WEIGHTS_VERSION } from '@/lib/matching/score'
import { mapRowToPet, type PetRow } from '@/types/pet'

// Columns the matching engine actually reads. Keeps the SELECT lean so a
// single bulk recompute can pull thousands of rows without paging.
const PROFILE_COLS = [
  'user_id',
  'housing_type',
  'has_kids',
  'kid_ages',
  'other_pets',
  'mesh_status',
  'experience',
  'activity_level',
  'special_needs_ok',
  'completion_pct',
].join(',')

const PET_COLS = [
  'id',
  'source',
  'source_id',
  'source_url',
  'name',
  'species',
  'breed',
  'sex',
  'age_months',
  'size',
  'weight_kg',
  'height_cm',
  'hdb_approved',
  'energy_level',
  'description',
  'photo_urls',
  'tags',
  'low_confidence_fields',
  'status',
  'first_seen_at',
  'last_seen_at',
].join(',')

type ScoreUpsertRow = {
  user_id: string
  pet_id: string
  score: number
  tier: string
  reasons_json: unknown
  weights_version: string
  stale: boolean
  computed_at: string
}

// Supabase upserts cap at ~1000 rows per request in practice. Stay well
// under so a single user with the full pet catalog (a few hundred pets)
// fits in one call.
const UPSERT_BATCH = 500

async function bulkUpsertScores(rows: ScoreUpsertRow[]): Promise<void> {
  if (rows.length === 0) return
  const client = createServerClient()
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH)
    const { error } = await client
      .from('match_scores')
      .upsert(batch, { onConflict: 'user_id,pet_id' })
    if (error) throw new Error(`match_scores upsert failed: ${error.message}`)
  }
}

/**
 * Recompute every `match_scores` row for one user. Pulls the user's profile
 * once, streams the entire `available`/`pending` pet catalog, scores each
 * pet, then upserts the results in batches.
 *
 * Runs on profile updates and on initial signup (once Phase 3 wires the
 * post-signup recompute).
 */
export async function recomputeForUser(userId: string): Promise<{ written: number }> {
  const client = createServerClient()
  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('user_id', userId)
    .maybeSingle<ProfileRowForMatching>()
  if (profileErr) throw new Error(`profiles read failed: ${profileErr.message}`)
  if (!profile) return { written: 0 }

  const matchProfile = profileRowToMatchProfile(profile)
  const now = new Date().toISOString()

  // Stream the catalog. Range-paginate to avoid the default 1000-row cap.
  const rows: ScoreUpsertRow[] = []
  const PAGE = 1000
  let offset = 0
  for (;;) {
    const { data: pets, error: petsErr } = await client
      .from('pets')
      .select(PET_COLS)
      .in('status', ['available', 'pending'])
      .range(offset, offset + PAGE - 1)
    if (petsErr) throw new Error(`pets read failed: ${petsErr.message}`)
    const page = (pets ?? []) as unknown as PetRow[]
    if (page.length === 0) break
    for (const petRow of page) {
      const pet = mapRowToPet(petRow)
      const matchPet = petToMatchPet(pet)
      const result = score(matchProfile, matchPet)
      rows.push({
        user_id: userId,
        pet_id: pet.id,
        score: result.score,
        tier: result.tier,
        reasons_json: result.reasons,
        weights_version: WEIGHTS_VERSION,
        stale: false,
        computed_at: now,
      })
    }
    if (page.length < PAGE) break
    offset += PAGE
  }

  await bulkUpsertScores(rows)
  return { written: rows.length }
}

/**
 * Recompute every `match_scores` row for one pet against all users.
 *
 * Fired by the daily scraper as pets are inserted/updated. Cost scales with
 * the user count, so we don't worry about it until Phase 3 has a meaningful
 * authenticated population.
 */
export async function recomputeForPet(petId: string): Promise<{ written: number }> {
  const client = createServerClient()
  const { data: petRow, error: petErr } = await client
    .from('pets')
    .select(PET_COLS)
    .eq('id', petId)
    .maybeSingle<PetRow>()
  if (petErr) throw new Error(`pet read failed: ${petErr.message}`)
  if (!petRow) return { written: 0 }
  const pet = mapRowToPet(petRow)
  if (pet.status !== 'available' && pet.status !== 'pending') {
    // Pet is gone — drop its scores so we don't surface stale rows.
    const { error } = await client.from('match_scores').delete().eq('pet_id', petId)
    if (error) throw new Error(`match_scores delete failed: ${error.message}`)
    return { written: 0 }
  }

  const matchPet = petToMatchPet(pet)
  const now = new Date().toISOString()

  const rows: ScoreUpsertRow[] = []
  const PAGE = 1000
  let offset = 0
  for (;;) {
    const { data: profiles, error: profErr } = await client
      .from('profiles')
      .select(PROFILE_COLS)
      .range(offset, offset + PAGE - 1)
    if (profErr) throw new Error(`profiles read failed: ${profErr.message}`)
    const page = (profiles ?? []) as unknown as (ProfileRowForMatching & {
      user_id: string
    })[]
    if (page.length === 0) break
    for (const profileRow of page) {
      const matchProfile = profileRowToMatchProfile(profileRow)
      const result = score(matchProfile, matchPet)
      rows.push({
        user_id: profileRow.user_id,
        pet_id: petId,
        score: result.score,
        tier: result.tier,
        reasons_json: result.reasons,
        weights_version: WEIGHTS_VERSION,
        stale: false,
        computed_at: now,
      })
    }
    if (page.length < PAGE) break
    offset += PAGE
  }

  await bulkUpsertScores(rows)
  return { written: rows.length }
}
