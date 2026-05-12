// Public types for the matching engine. Kept narrow — every field on
// MatchProfile and MatchPet has a matching column in the DB, but the engine
// only cares about the subset that influences scoring. Anything else
// (created_at, source_url, photos) lives in the broader Pet/Profile types
// and is intentionally omitted here.

export type Housing = 'hdb' | 'condo' | 'landed' | 'other'
export type Species = 'dog' | 'cat' | 'rabbit' | 'other'
export type Size = 'small' | 'medium' | 'large'
export type Energy = 'low' | 'medium' | 'high'
export type Activity = 'sedentary' | 'moderate' | 'very_active'
export type Experience = 'first_time' | 'some' | 'experienced'
export type OtherPets = 'none' | 'cats' | 'dogs' | 'both'
export type MeshStatus = 'meshed' | 'not_meshed' | 'planning'
export type Tier = 'great' | 'good' | 'stretch' | 'hard_fail'

export type MatchProfile = {
  housing_type?: Housing | null
  has_kids?: boolean | null
  kid_ages?: number[]
  other_pets?: OtherPets | null
  mesh_status?: MeshStatus | null
  experience?: Experience | null
  activity_level?: Activity | null
  special_needs_ok?: boolean | null
  // 0–100. Both the server trigger and the client-side computeCompletionPct
  // use the same formula so an anonymous user's tier doesn't shift when
  // they create an account.
  completion_pct: number
}

export type MatchPet = {
  id: string
  name: string
  species: Species
  breed?: string | null
  weight_kg?: number | null
  height_cm?: number | null
  size?: Size | null
  energy_level?: Energy | null
  hdb_approved?: boolean | null
  // The Phase 2.2 controlled-vocab tags. Negative-tag variants (e.g.
  // `not_good_with_kids`) are checked by the hard-fail rules; the LLM
  // doesn't emit them today but scrapers occasionally do for explicit
  // shelter warnings.
  tags: string[]
  // Per §2.1.4, columns listed here were filled by the LLM at low
  // confidence. Matching applies conservative bias: a low-confidence
  // hdb_approved=true is treated as `null`, never as `true`, so we don't
  // accidentally HDB-approve a pet the algorithm couldn't pin down.
  low_confidence_fields?: string[]
}

// One reason emitted with the score. Templates are referenced by name so
// the UI can localise without re-running scoring, and rendered strings are
// pre-filled with the pet's actual values per §2.3.5.
export type ReasonKind = 'positive' | 'note' | 'risk'

export type Reason = {
  template: string
  message: string
  kind: ReasonKind
}

export type ComponentName =
  | 'housing_fit'
  | 'size_fit'
  | 'energy_fit'
  | 'experience_fit'
  | 'compatibility'
  | 'special_needs'

export type Components = Record<ComponentName, number>

export type MatchScore = {
  // 0–100, clamped. With default weights summing to 100 and components in
  // [-1, 1], theoretical raw range is [-50, 150]; clamping keeps the
  // displayed number interpretable as a percentage-like value.
  score: number
  tier: Tier
  // Two reasons max on the swipe card; full breakdown on detail. The engine
  // returns the full set, the UI picks.
  reasons: Reason[]
  // Template names of any hard-fail rules that fired. Empty when no rule
  // tripped. A pet with a non-empty list always has tier='hard_fail'.
  hard_fails: string[]
  weights_version: string
  // Raw component scores, useful in admin / debug views. Not displayed in
  // the swipe UI.
  components: Components
}
