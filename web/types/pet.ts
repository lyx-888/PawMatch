// Domain type for a pet. The DB row uses snake_case; this is the shape the rest
// of the app consumes. Keep `mapRowToPet` as the only place that knows about
// row shape — components and pages should never touch raw rows.

export type Species = 'dog' | 'cat' | 'rabbit' | 'other'
export type Sex = 'male' | 'female' | 'unknown'
export type Size = 'small' | 'medium' | 'large'
export type Energy = 'low' | 'medium' | 'high'
export type PetStatus = 'available' | 'pending' | 'adopted' | 'gone'

export type Pet = {
  id: string
  source: string
  sourceId: string
  sourceUrl: string
  name: string
  species: Species
  breed: string | null
  sex: Sex | null
  ageMonths: number | null
  size: Size | null
  weightKg: number | null
  heightCm: number | null
  hdbApproved: boolean | null
  // Added in migration 008 (Phase 2.2 LLM extraction). Drives the energy
  // axis of the matching engine; null when neither the scraper nor the
  // LLM produced a value.
  energyLevel: Energy | null
  description: string | null
  photoUrls: string[]
  tags: string[]
  // Per §2.1.4. The matching engine checks this set before honouring any
  // LLM-extracted column — a low-confidence `hdb_approved=true` is never
  // treated as `true` in scoring.
  lowConfidenceFields: string[]
  status: PetStatus
  firstSeenAt: string
  lastSeenAt: string
}

export type PetRow = {
  id: string
  source: string
  source_id: string
  source_url: string
  name: string
  species: string
  breed: string | null
  sex: string | null
  age_months: number | null
  size: string | null
  weight_kg: number | null
  height_cm: number | null
  hdb_approved: boolean | null
  energy_level: string | null
  description: string | null
  photo_urls: string[]
  tags: string[]
  low_confidence_fields: string[] | null
  status: string
  first_seen_at: string
  last_seen_at: string
}

export function mapRowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    name: row.name,
    species: row.species as Species,
    breed: row.breed,
    sex: row.sex as Sex | null,
    ageMonths: row.age_months,
    size: row.size as Size | null,
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    hdbApproved: row.hdb_approved,
    energyLevel: row.energy_level as Energy | null,
    description: row.description,
    photoUrls: row.photo_urls ?? [],
    tags: row.tags ?? [],
    lowConfidenceFields: row.low_confidence_fields ?? [],
    status: row.status as PetStatus,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }
}
