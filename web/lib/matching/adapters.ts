// Adapters between the app's domain types (Pet, ProfileDraft) and the
// matching engine's input types (MatchPet, MatchProfile). The matching
// engine deliberately uses a minimal type surface — only the fields it
// scores against — so future Pet schema changes don't ripple into the
// scoring code.

import type { Pet } from '@/types/pet'

import { computeCompletionPct, type ProfileDraft } from '@/lib/onboarding/profile-draft'

import type {
  Activity,
  Energy,
  Experience,
  Housing,
  MatchPet,
  MatchProfile,
  MeshStatus,
  OtherPets,
  Size,
  Species,
} from './types'

/**
 * Convert a server-fetched Pet into a MatchPet suitable for `score()`.
 * The shape difference is just camelCase → snake_case; the LLM-extracted
 * fields (energy_level, low_confidence_fields) flow through unchanged.
 */
export function petToMatchPet(pet: Pet): MatchPet {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species as Species,
    breed: pet.breed,
    weight_kg: pet.weightKg,
    height_cm: pet.heightCm,
    size: pet.size as Size | null,
    energy_level: pet.energyLevel as Energy | null,
    hdb_approved: pet.hdbApproved,
    tags: pet.tags,
    low_confidence_fields: pet.lowConfidenceFields,
  }
}

/**
 * Convert the anonymous user's localStorage ProfileDraft into a MatchProfile.
 * `completion_pct` is computed here (the draft doesn't carry it) so the
 * client uses the same formula as the SQL trigger that runs on
 * authenticated profiles — anon users can't fake a higher tier.
 */
export function profileDraftToMatchProfile(draft: ProfileDraft): MatchProfile {
  return {
    housing_type: draft.housing_type as Housing | null | undefined,
    has_kids: draft.has_kids ?? null,
    kid_ages: draft.kid_ages,
    other_pets: draft.other_pets as OtherPets | null | undefined,
    mesh_status: draft.mesh_status as MeshStatus | null | undefined,
    experience: draft.experience as Experience | null | undefined,
    activity_level: draft.activity_level as Activity | null | undefined,
    special_needs_ok: draft.special_needs_ok ?? null,
    completion_pct: computeCompletionPct(draft),
  }
}

// Minimal shape of a `profiles` row used by the matching engine. Keeping it
// local rather than importing `Profile` from `@/types/profile` lets this
// adapter compile in any context (Inngest functions, tests) without
// dragging the wider profile types in.
export type ProfileRowForMatching = {
  housing_type: string | null
  has_kids: boolean | null
  kid_ages: number[] | null
  other_pets: string | null
  mesh_status: string | null
  experience: string | null
  activity_level: string | null
  special_needs_ok: boolean | null
  completion_pct: number | null
}

/**
 * Convert a server-side `profiles` row into a MatchProfile for `score()`.
 * Same target shape as `profileDraftToMatchProfile`, just sourced from the
 * authoritative DB row (where `completion_pct` is set by the SQL trigger).
 */
export function profileRowToMatchProfile(row: ProfileRowForMatching): MatchProfile {
  return {
    housing_type: row.housing_type as Housing | null | undefined,
    has_kids: row.has_kids,
    kid_ages: row.kid_ages ?? [],
    other_pets: row.other_pets as OtherPets | null | undefined,
    mesh_status: row.mesh_status as MeshStatus | null | undefined,
    experience: row.experience as Experience | null | undefined,
    activity_level: row.activity_level as Activity | null | undefined,
    special_needs_ok: row.special_needs_ok,
    completion_pct: row.completion_pct ?? 0,
  }
}
