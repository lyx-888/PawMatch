// Reason templates per §2.3.5. Each template has a stable name (for analytics
// and localisation) and a render function that fills the pet's specifics so
// the message is concrete, not generic praise. The swipe card displays two
// at most; the detail page shows the full list — both ultimately come from
// here.

import type { MatchPet, MatchProfile, Reason } from './types'

// Template names are exported so callers can pattern-match on them (e.g.
// the UI uses 'housing_fit_fail' to render the hard-fail overlay). Keep
// these stable — analytics dashboards and i18n catalogs will reference
// them directly.
export const TEMPLATES = {
  housing_fit_pass: 'housing_fit_pass',
  housing_fit_fail: 'housing_fit_fail',
  housing_fit_condo: 'housing_fit_condo',
  housing_fit_landed: 'housing_fit_landed',
  mesh_required: 'mesh_required',
  mesh_meshed: 'mesh_meshed',
  size_appropriate: 'size_appropriate',
  size_too_big_hdb: 'size_too_big_hdb',
  height_limit_fail: 'height_limit_fail',
  energy_match: 'energy_match',
  energy_mismatch: 'energy_mismatch',
  experience_first_time_warning: 'experience_first_time_warning',
  experience_first_time_ok: 'experience_first_time_ok',
  compat_kids_pass: 'compat_kids_pass',
  compat_kids_unknown: 'compat_kids_unknown',
  compat_kids_incompatible: 'compat_kids_incompatible',
  compat_cats_pass: 'compat_cats_pass',
  compat_cats_unknown: 'compat_cats_unknown',
  compat_cats_incompatible: 'compat_cats_incompatible',
  compat_dogs_pass: 'compat_dogs_pass',
  compat_dogs_unknown: 'compat_dogs_unknown',
  compat_dogs_incompatible: 'compat_dogs_incompatible',
  special_needs_ok_match: 'special_needs_ok_match',
  special_needs_mismatch: 'special_needs_mismatch',
} as const

export type Template = (typeof TEMPLATES)[keyof typeof TEMPLATES]

// English copy for v1. When Phase 2.12 lands the i18n scaffolding, this
// table moves into `web/lib/i18n/en.json` and the renderer reads keys via
// `t()`. The signature here matches the i18n pattern — name + template
// values — so the migration is mechanical.
const TEMPLATE_STRINGS: Record<Template, string> = {
  housing_fit_pass: '{name} ({weight}kg) fits HDB’s 10kg limit',
  housing_fit_fail: '{name} is {weight}kg, above HDB’s 10kg limit',
  housing_fit_condo: '{name} fits comfortably in a condo',
  housing_fit_landed: 'Plenty of room for {name} in a landed home',
  mesh_required: 'Mesh required before cat adoption — yours is reported unmeshed',
  mesh_meshed: 'Your meshed windows clear SPCA’s cat-adoption rule',
  size_appropriate: '{name}’s size is a good fit for your home',
  size_too_big_hdb: '{name} is {size}, above HDB’s size guidance',
  height_limit_fail: '{name} is taller than HDB’s 55cm height limit',
  energy_match: '{energy} energy matches your {activity} lifestyle',
  energy_mismatch: '{energy} energy is busier than your {activity} lifestyle',
  experience_first_time_warning:
    '{name} is flagged as {flag} — usually a bigger ask for first-time adopters',
  experience_first_time_ok: 'Listing notes {name} is great for first-time adopters',
  compat_kids_pass: 'Listing notes {name} is good with kids',
  compat_kids_unknown: 'Compatibility with kids not stated — ask the shelter',
  compat_kids_incompatible: 'Listing notes {name} is not suited to households with kids',
  compat_cats_pass: 'Listing notes {name} is good with cats',
  compat_cats_unknown: 'Compatibility with cats not stated — ask the shelter',
  compat_cats_incompatible: 'Listing notes {name} is not suited to homes with cats',
  compat_dogs_pass: 'Listing notes {name} is good with dogs',
  compat_dogs_unknown: 'Compatibility with other dogs not stated — ask the shelter',
  compat_dogs_incompatible: 'Listing notes {name} is not suited to homes with dogs',
  special_needs_ok_match: '{name} has special needs and you’ve said yes to that',
  special_needs_mismatch: '{name} has special needs and you’ve said no to that',
}

const KIND_OF_TEMPLATE: Record<Template, Reason['kind']> = {
  housing_fit_pass: 'positive',
  housing_fit_fail: 'risk',
  housing_fit_condo: 'positive',
  housing_fit_landed: 'positive',
  mesh_required: 'risk',
  mesh_meshed: 'positive',
  size_appropriate: 'positive',
  size_too_big_hdb: 'risk',
  height_limit_fail: 'risk',
  energy_match: 'positive',
  energy_mismatch: 'note',
  experience_first_time_warning: 'note',
  experience_first_time_ok: 'positive',
  compat_kids_pass: 'positive',
  compat_kids_unknown: 'note',
  compat_kids_incompatible: 'risk',
  compat_cats_pass: 'positive',
  compat_cats_unknown: 'note',
  compat_cats_incompatible: 'risk',
  compat_dogs_pass: 'positive',
  compat_dogs_unknown: 'note',
  compat_dogs_incompatible: 'risk',
  special_needs_ok_match: 'positive',
  special_needs_mismatch: 'risk',
}

/**
 * Render a template by name with the given values. Unfilled placeholders
 * stay verbatim — surfaces as a missing-value bug in dev rather than a
 * silent empty string in prod.
 */
export function renderReason(
  template: Template,
  values: Record<string, string | number | undefined> = {},
): Reason {
  const raw = TEMPLATE_STRINGS[template]
  const message = raw.replace(/\{(\w+)\}/g, (full, key) => {
    const value = values[key]
    return value === undefined || value === null ? full : String(value)
  })
  return { template, message, kind: KIND_OF_TEMPLATE[template] }
}

// Shorthand the score module uses to build the pet's render values once
// per call rather than per reason. Centralises the small string conversions
// so a future change to e.g. "8kg" → "8.0kg" is one place.
export function renderValues(pet: MatchPet, profile: MatchProfile): Record<string, string> {
  return {
    name: pet.name,
    weight: pet.weight_kg !== null && pet.weight_kg !== undefined ? String(pet.weight_kg) : '—',
    size: pet.size ?? 'unspecified',
    energy: pet.energy_level ?? 'unspecified',
    activity: profile.activity_level ?? 'unspecified',
    flag: pet.tags.includes('special_needs') ? 'special-needs' : 'shy',
  }
}
