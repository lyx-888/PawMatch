// Server-side helper for fetching today's "Possibly Yours" picks for the
// currently authenticated user. Returns an empty array when the user is
// anonymous, when no picks have been generated, or when every picked pet
// is no longer available.

import { createServerClient } from './client'
import { mapRowToPet, type Pet, type PetRow } from '@/types/pet'

export async function getTodaysPicksForUser(userId: string): Promise<Pet[]> {
  const client = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: picksRow, error: pickErr } = await client
    .from('daily_picks')
    .select('pet_ids')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle<{ pet_ids: string[] }>()
  if (pickErr) throw new Error(`daily_picks read failed: ${pickErr.message}`)
  if (!picksRow || picksRow.pet_ids.length === 0) return []

  const { data: petsData, error: petsErr } = await client
    .from('pets')
    .select('*')
    .in('id', picksRow.pet_ids)
    .in('status', ['available', 'pending'])
  if (petsErr) throw new Error(`picks pets read failed: ${petsErr.message}`)

  const pets = ((petsData ?? []) as PetRow[]).map(mapRowToPet)
  // Preserve the original pick order — pet_ids reflects the generator's
  // ranking and we want the top match to appear first in the carousel.
  const byId = new Map(pets.map((p) => [p.id, p]))
  return picksRow.pet_ids.map((id) => byId.get(id)).filter((p): p is Pet => Boolean(p))
}
