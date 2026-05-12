// Pure scoring engine. No DB, no async, no side effects — `score(profile, pet)`
// is deterministic. Same algorithm runs server-side (Phase 2.6b, against
// stored profiles + pets) and client-side (Phase 2.7.1, against the
// localStorage profile so anonymous users see tier badges). The shared
// fixture file `tests/matching-fixtures.json` is the calibration oracle.
//
// Reading order:
//   1. The six sub-functions per §2.3.1.a–f.
//   2. `collectHardFails` per §2.3.2.
//   3. `score` glues them together with the weighting from §2.3.3 and the
//      tier rules from §2.3.4.

import { isAdoreBreed, isSingaporeSpecial, SINGAPORE_SPECIAL_WEIGHT_LIMIT_KG } from './adore-breeds'
import { renderReason, renderValues, TEMPLATES } from './reasons'
import type {
  ComponentName,
  Components,
  MatchPet,
  MatchProfile,
  MatchScore,
  Reason,
  Tier,
} from './types'

// Bump when ANY scoring behaviour changes — weights, sub-functions, hard
// fails, tier thresholds. Stored alongside each computed score (Phase 2.6b)
// so we can A/B test changes and recompute selectively.
export const WEIGHTS_VERSION = '1.0.0'

export const DEFAULT_WEIGHTS: Record<ComponentName, number> = {
  housing_fit: 25,
  size_fit: 15,
  energy_fit: 15,
  experience_fit: 10,
  compatibility: 20,
  special_needs: 15,
}

// Tier thresholds per §2.3.4. Pulled out as constants so test fixtures and
// the UI can reference them by name.
export const TIER_GREAT_MIN = 75
export const TIER_GOOD_MIN = 55
export const HARD_FAIL_SCORE_CEILING = 30
export const COMPLETION_PCT_FOR_GREAT = 60

// HDB rules per §2.3.2.
const HDB_DOG_WEIGHT_LIMIT_KG = 10
const HDB_DOG_HEIGHT_LIMIT_CM = 55

// --- 2.3.1.a housing_fit_score -------------------------------------------

export function housingFitScore(profile: MatchProfile, pet: MatchPet): number {
  if (!profile.housing_type) return 0

  if (profile.housing_type === 'hdb') {
    if (pet.species === 'cat') {
      // Mesh confirmed: full positive. Mesh unspecified: neutral (the hard-
      // fail rule catches `not_meshed`).
      return profile.mesh_status === 'meshed' ? 1.0 : 0.0
    }
    if (pet.species === 'dog') {
      // Conservative: a low-confidence hdb_approved=true is treated as null
      // so we never mis-flag a pet as HDB-clear when we're guessing.
      const hdbApproved = isFieldTrustworthy(pet, 'hdb_approved') ? pet.hdb_approved : null
      if (hdbApproved === true) return 1.0

      const weight = trustworthyWeight(pet)
      if (weight !== null && weight <= HDB_DOG_WEIGHT_LIMIT_KG) {
        // Small breed within the 10kg limit clears regardless of ADORE
        // membership.
        return 1.0
      }
      // Oversized but on ADORE (Singapore Special ≤ 15kg or one of the
      // named breeds) still clears.
      if (
        isSingaporeSpecial(pet.breed) &&
        weight !== null &&
        weight <= SINGAPORE_SPECIAL_WEIGHT_LIMIT_KG
      ) {
        return 1.0
      }
      if (isAdoreBreed(pet.breed)) return 1.0

      // Unknown size + unknown ADORE membership: neutral. We'd rather show
      // 0.0 than a false positive. The hard-fail rule handles the
      // confirmed-oversize case.
      return 0.0
    }
    // Other species (rabbit, etc.) in HDB: small / neutral positive.
    return 0.5
  }

  if (profile.housing_type === 'condo' || profile.housing_type === 'landed') {
    return 0.5
  }
  // 'other' housing — neutral; the matching engine doesn't know the rules.
  return 0.0
}

// --- 2.3.1.b size_fit_score ----------------------------------------------

export function sizeFitScore(profile: MatchProfile, pet: MatchPet): number {
  if (pet.species === 'cat' || pet.species === 'rabbit') return 1.0
  if (pet.species !== 'dog') return 0.0

  const size = pet.size
  if (size == null) return 0.0
  if (!profile.housing_type) return 0.0

  if (profile.housing_type === 'hdb') {
    if (size === 'small') return 1.0
    if (size === 'medium') return 0.0
    return -1.0 // large
  }
  if (profile.housing_type === 'condo') {
    if (size === 'medium') return 1.0
    return 0.5 // small or large both manageable
  }
  if (profile.housing_type === 'landed') {
    return 1.0
  }
  return 0.0
}

// --- 2.3.1.c energy_fit_score --------------------------------------------

export function energyFitScore(profile: MatchProfile, pet: MatchPet): number {
  const activity = profile.activity_level
  const energy = pet.energy_level
  if (!activity || !energy) return 0.0

  if (activity === 'sedentary') {
    if (energy === 'low') return 1.0
    if (energy === 'medium') return 0.0
    return -1.0 // high
  }
  if (activity === 'moderate') {
    if (energy === 'medium') return 1.0
    return 0.3
  }
  // very_active
  if (energy === 'high') return 1.0
  if (energy === 'medium') return 0.5
  return -0.3
}

// --- 2.3.1.d experience_fit_score ----------------------------------------

export function experienceFitScore(profile: MatchProfile, pet: MatchPet): number {
  if (!profile.experience) return 0.0

  if (profile.experience === 'first_time') {
    const challenging = pet.tags.includes('special_needs') || pet.tags.includes('shy')
    if (challenging) return -1.0
    // The 'first_time_friendly' tag isn't in the §2.1.4 controlled vocab;
    // shelters sometimes write it directly though, so we check for it as
    // a free-text scraper tag.
    if (pet.tags.includes('first_time_friendly')) return 1.0
    return 0.0
  }
  // 'some' or 'experienced'.
  return 0.5
}

// --- 2.3.1.e compatibility_score -----------------------------------------

export function compatibilityScore(profile: MatchProfile, pet: MatchPet): number {
  // Build the list of traits the user has at home that we need to check.
  const traits: Array<'kids' | 'cats' | 'dogs'> = []
  if (profile.has_kids === true) traits.push('kids')
  if (profile.other_pets === 'cats' || profile.other_pets === 'both') traits.push('cats')
  if (profile.other_pets === 'dogs' || profile.other_pets === 'both') traits.push('dogs')
  if (traits.length === 0) return 0.0

  let positive = 0
  let unknownPenalty = 0
  for (const trait of traits) {
    const goodTag = `good_with_${trait}`
    const badTag = `not_good_with_${trait}`
    if (pet.tags.includes(badTag)) {
      // The hard-fail rule catches this case and short-circuits the tier;
      // we still return -1.0 so the raw score reflects the mismatch in
      // admin / debug views.
      return -1.0
    }
    if (pet.tags.includes(goodTag)) {
      positive += 0.4
    } else {
      unknownPenalty += 0.2
    }
  }
  positive = Math.min(positive, 1.0)
  unknownPenalty = Math.min(unknownPenalty, 0.4)
  return positive - unknownPenalty
}

// --- 2.3.1.f special_needs_score -----------------------------------------

export function specialNeedsScore(profile: MatchProfile, pet: MatchPet): number {
  const isSpecial = pet.tags.includes('special_needs')
  if (!isSpecial) return 0.0
  if (profile.special_needs_ok == null) return 0.0
  return profile.special_needs_ok ? 1.0 : -1.0
}

// --- 2.3.2 hard fails ----------------------------------------------------

export function collectHardFails(profile: MatchProfile, pet: MatchPet): string[] {
  const fails: string[] = []

  // HDB dog: oversize + non-ADORE → fail.
  if (profile.housing_type === 'hdb' && pet.species === 'dog') {
    const weight = trustworthyWeight(pet)
    if (
      weight !== null &&
      weight > HDB_DOG_WEIGHT_LIMIT_KG &&
      !(isSingaporeSpecial(pet.breed) && weight <= SINGAPORE_SPECIAL_WEIGHT_LIMIT_KG) &&
      !isAdoreBreed(pet.breed)
    ) {
      fails.push(TEMPLATES.housing_fit_fail)
    }
    // Height limit applies regardless of breed.
    if (
      pet.height_cm !== null &&
      pet.height_cm !== undefined &&
      pet.height_cm > HDB_DOG_HEIGHT_LIMIT_CM
    ) {
      fails.push(TEMPLATES.height_limit_fail)
    }
  }

  // Cat without mesh: only fail when the user has explicitly said unmeshed
  // — `null` or `planning` is treated as a note (handled in reasons), not
  // a hard fail.
  if (pet.species === 'cat' && profile.mesh_status === 'not_meshed') {
    fails.push(TEMPLATES.mesh_required)
  }

  // Trait incompatibility tags. Only the user-has-trait branch matters
  // (someone without kids isn't affected by `not_good_with_kids`).
  if (profile.has_kids === true && pet.tags.includes('not_good_with_kids')) {
    fails.push(TEMPLATES.compat_kids_incompatible)
  }
  const hasCats = profile.other_pets === 'cats' || profile.other_pets === 'both'
  if (hasCats && pet.tags.includes('not_good_with_cats')) {
    fails.push(TEMPLATES.compat_cats_incompatible)
  }
  const hasDogs = profile.other_pets === 'dogs' || profile.other_pets === 'both'
  if (hasDogs && pet.tags.includes('not_good_with_dogs')) {
    fails.push(TEMPLATES.compat_dogs_incompatible)
  }

  return fails
}

// --- Top-level score() ---------------------------------------------------

export type ScoreOptions = {
  weights?: Record<ComponentName, number>
}

export function score(
  profile: MatchProfile,
  pet: MatchPet,
  options: ScoreOptions = {},
): MatchScore {
  const weights = options.weights ?? DEFAULT_WEIGHTS

  const components: Components = {
    housing_fit: housingFitScore(profile, pet),
    size_fit: sizeFitScore(profile, pet),
    energy_fit: energyFitScore(profile, pet),
    experience_fit: experienceFitScore(profile, pet),
    compatibility: compatibilityScore(profile, pet),
    special_needs: specialNeedsScore(profile, pet),
  }

  const raw =
    50 +
    weights.housing_fit * components.housing_fit +
    weights.size_fit * components.size_fit +
    weights.energy_fit * components.energy_fit +
    weights.experience_fit * components.experience_fit +
    weights.compatibility * components.compatibility +
    weights.special_needs * components.special_needs

  let finalScore = clamp(Math.round(raw), 0, 100)

  const hardFails = collectHardFails(profile, pet)
  let tier: Tier
  if (hardFails.length > 0) {
    tier = 'hard_fail'
    finalScore = Math.min(finalScore, HARD_FAIL_SCORE_CEILING)
  } else if (profile.completion_pct < COMPLETION_PCT_FOR_GREAT) {
    // Essentials-only profile: capped at 'good'. The matching engine never
    // promises a 'great' match without the §2.3.4 completion threshold.
    tier = finalScore >= TIER_GOOD_MIN ? 'good' : 'stretch'
  } else {
    tier = finalScore >= TIER_GREAT_MIN ? 'great' : finalScore >= TIER_GOOD_MIN ? 'good' : 'stretch'
  }

  const reasons = buildReasons(profile, pet, components, hardFails)

  return {
    score: finalScore,
    tier,
    reasons,
    hard_fails: hardFails,
    weights_version: WEIGHTS_VERSION,
    components,
  }
}

// --- Reason assembly -----------------------------------------------------

function buildReasons(
  profile: MatchProfile,
  pet: MatchPet,
  components: Components,
  hardFails: string[],
): Reason[] {
  const values = renderValues(pet, profile)
  const reasons: Reason[] = []

  // Hard-fail messages come first so the UI can always render them in
  // priority even when picking only 2.
  for (const template of hardFails) {
    reasons.push(renderReason(template as never, values))
  }

  // Positive housing message when it cleared.
  if (components.housing_fit > 0 && profile.housing_type) {
    if (profile.housing_type === 'hdb') {
      if (pet.species === 'cat' && profile.mesh_status === 'meshed') {
        reasons.push(renderReason(TEMPLATES.mesh_meshed, values))
      } else if (pet.species === 'dog' && pet.weight_kg != null) {
        reasons.push(renderReason(TEMPLATES.housing_fit_pass, values))
      }
    } else if (profile.housing_type === 'condo') {
      reasons.push(renderReason(TEMPLATES.housing_fit_condo, values))
    } else if (profile.housing_type === 'landed') {
      reasons.push(renderReason(TEMPLATES.housing_fit_landed, values))
    }
  }

  // Size message for dogs only — cats/rabbits skip the size axis.
  if (
    pet.species === 'dog' &&
    pet.size != null &&
    !hardFails.includes(TEMPLATES.housing_fit_fail)
  ) {
    if (components.size_fit > 0) {
      reasons.push(renderReason(TEMPLATES.size_appropriate, values))
    } else if (
      components.size_fit < 0 &&
      profile.housing_type === 'hdb' &&
      !hardFails.includes(TEMPLATES.housing_fit_fail)
    ) {
      reasons.push(renderReason(TEMPLATES.size_too_big_hdb, values))
    }
  }

  // Energy match.
  if (profile.activity_level && pet.energy_level) {
    if (components.energy_fit > 0) {
      reasons.push(renderReason(TEMPLATES.energy_match, values))
    } else if (components.energy_fit < 0) {
      reasons.push(renderReason(TEMPLATES.energy_mismatch, values))
    }
  }

  // First-time experience caveat.
  if (profile.experience === 'first_time') {
    if (pet.tags.includes('special_needs') || pet.tags.includes('shy')) {
      reasons.push(renderReason(TEMPLATES.experience_first_time_warning, values))
    } else if (pet.tags.includes('first_time_friendly')) {
      reasons.push(renderReason(TEMPLATES.experience_first_time_ok, values))
    }
  }

  // Compatibility per trait. We emit one reason per relevant trait so the
  // detail view can show all three; the swipe card picks the most decisive.
  if (profile.has_kids === true && !hardFails.includes(TEMPLATES.compat_kids_incompatible)) {
    if (pet.tags.includes('good_with_kids')) {
      reasons.push(renderReason(TEMPLATES.compat_kids_pass, values))
    } else {
      reasons.push(renderReason(TEMPLATES.compat_kids_unknown, values))
    }
  }
  const hasCats = profile.other_pets === 'cats' || profile.other_pets === 'both'
  if (hasCats && !hardFails.includes(TEMPLATES.compat_cats_incompatible)) {
    if (pet.tags.includes('good_with_cats')) {
      reasons.push(renderReason(TEMPLATES.compat_cats_pass, values))
    } else {
      reasons.push(renderReason(TEMPLATES.compat_cats_unknown, values))
    }
  }
  const hasDogs = profile.other_pets === 'dogs' || profile.other_pets === 'both'
  if (hasDogs && !hardFails.includes(TEMPLATES.compat_dogs_incompatible)) {
    if (pet.tags.includes('good_with_dogs')) {
      reasons.push(renderReason(TEMPLATES.compat_dogs_pass, values))
    } else {
      reasons.push(renderReason(TEMPLATES.compat_dogs_unknown, values))
    }
  }

  // Special-needs alignment.
  if (pet.tags.includes('special_needs') && profile.special_needs_ok != null) {
    reasons.push(
      renderReason(
        profile.special_needs_ok
          ? TEMPLATES.special_needs_ok_match
          : TEMPLATES.special_needs_mismatch,
        values,
      ),
    )
  }

  return reasons
}

// --- Helpers --------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

// A field is trustworthy when it isn't on the low-confidence list. Used to
// honour §2.1.4's "never falsely tell a user a pet fits HDB" rule.
function isFieldTrustworthy(pet: MatchPet, field: string): boolean {
  if (!pet.low_confidence_fields || pet.low_confidence_fields.length === 0) return true
  return !pet.low_confidence_fields.includes(field)
}

function trustworthyWeight(pet: MatchPet): number | null {
  if (pet.weight_kg === null || pet.weight_kg === undefined) return null
  // We don't have a separate confidence on weight; the scraper writes weight
  // from structured fields when present, so treat any provided weight as
  // ground truth here.
  return pet.weight_kg
}
