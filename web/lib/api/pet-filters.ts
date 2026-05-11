import { z } from 'zod'
import { DEFAULT_LIMIT, MAX_LIMIT, type PetFilters } from '@/lib/db/pets'

// Zod schema for the /api/pets query string. Co-located with the filter type
// because callers (page server components, the route handler) both need it.

export const PetQuerySchema = z.object({
  species: z.enum(['dog', 'cat', 'rabbit', 'other']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  source: z.string().min(1).max(64).optional(),
  hdb_approved: z.enum(['true', 'false']).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  listed_since: z.string().min(1).max(32).optional(),
  exclude: z.union([z.string(), z.array(z.string())]).optional(),
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
})

export type PetQuery = z.infer<typeof PetQuerySchema>

export function parsePetQuery(searchParams: URLSearchParams): PetFilters {
  const raw: Record<string, string | string[]> = {}
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    raw[key] = values.length > 1 ? values : values[0]
  }
  const parsed = PetQuerySchema.parse(raw)
  return {
    species: parsed.species,
    size: parsed.size,
    source: parsed.source,
    hdbApproved:
      parsed.hdb_approved === 'true' ? true : parsed.hdb_approved === 'false' ? false : undefined,
    tags: toArray(parsed.tags),
    listedSince: parsed.listed_since,
    excludeIds: toArray(parsed.exclude),
    cursor: parsed.cursor ?? null,
    limit: parsed.limit ?? DEFAULT_LIMIT,
  }
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.filter((v) => v.length > 0)
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}
