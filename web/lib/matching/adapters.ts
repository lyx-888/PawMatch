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
