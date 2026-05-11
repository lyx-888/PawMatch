// Domain type for a pet. The DB row uses snake_case; this is the shape the rest
// of the app consumes. Keep `mapRowToPet` as the only place that knows about
// row shape — components and pages should never touch raw rows.

export type Species = 'dog' | 'cat' | 'rabbit' | 'other'
export type Sex = 'male' | 'female' | 'unknown'
export type Size = 'small' | 'medium' | 'large'
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
  description: string | null
  photoUrls: string[]
  tags: string[]
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
  description: string | null
  photo_urls: string[]
  tags: string[]
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
    description: row.description,
    photoUrls: row.photo_urls ?? [],
    tags: row.tags ?? [],
    status: row.status as PetStatus,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }
}
