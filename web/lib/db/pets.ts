import { createServerClient } from './client'
import { mapRowToPet, type Pet, type PetRow } from '@/types/pet'

export type PetFilters = {
  species?: string
  size?: string
  source?: string
  hdbApproved?: boolean
  tags?: string[]
  listedSince?: string // ISO date or duration like '7d'
  excludeIds?: string[]
  cursor?: string | null // last seen pet id for keyset pagination
  limit: number
}

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export async function getPetById(id: string): Promise<Pet | null> {
  const client = createServerClient()
  const { data, error } = await client.from('pets').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getPetById: ${error.message}`)
  return data ? mapRowToPet(data as PetRow) : null
}

export async function listPets(
  filters: PetFilters,
): Promise<{ pets: Pet[]; nextCursor: string | null }> {
  const client = createServerClient()
  let query = client
    .from('pets')
    .select('*')
    .in('status', ['available', 'pending'])
    .order('first_seen_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(filters.limit + 1) // fetch one extra to compute nextCursor

  if (filters.species) query = query.eq('species', filters.species)
  if (filters.size) query = query.eq('size', filters.size)
  if (filters.source) query = query.eq('source', filters.source)
  if (typeof filters.hdbApproved === 'boolean')
    query = query.eq('hdb_approved', filters.hdbApproved)
  if (filters.tags && filters.tags.length > 0) query = query.contains('tags', filters.tags)
  if (filters.listedSince) {
    const since = resolveListedSince(filters.listedSince)
    if (since) query = query.gte('first_seen_at', since)
  }
  if (filters.excludeIds && filters.excludeIds.length > 0) {
    // PostgREST `not.in` requires quoted ids when they're strings.
    query = query.not('id', 'in', `(${filters.excludeIds.map((id) => `"${id}"`).join(',')})`)
  }
  if (filters.cursor) {
    // Keyset cursor: encoded as ISO timestamp + id, joined by '|'.
    const parts = filters.cursor.split('|')
    if (parts.length === 2) {
      const [ts, id] = parts
      // Standard keyset: (first_seen_at, id) < (cursor_ts, cursor_id)
      query = query.or(`first_seen_at.lt.${ts},and(first_seen_at.eq.${ts},id.lt.${id})`)
    }
  }

  const { data, error } = await query
  if (error) throw new Error(`listPets: ${error.message}`)

  const rows = (data ?? []) as PetRow[]
  const hasMore = rows.length > filters.limit
  const pageRows = hasMore ? rows.slice(0, filters.limit) : rows
  const nextCursor =
    hasMore && pageRows.length > 0
      ? `${pageRows[pageRows.length - 1].first_seen_at}|${pageRows[pageRows.length - 1].id}`
      : null

  return { pets: pageRows.map(mapRowToPet), nextCursor }
}

export function resolveListedSince(raw: string): string | null {
  // Accept absolute ISO or a relative duration like '7d', '24h'.
  const durationMatch = /^(\d+)([dh])$/i.exec(raw.trim())
  if (durationMatch) {
    const value = Number.parseInt(durationMatch[1], 10)
    const unit = durationMatch[2].toLowerCase()
    const ms = unit === 'd' ? value * 86_400_000 : value * 3_600_000
    return new Date(Date.now() - ms).toISOString()
  }
  const asDate = new Date(raw)
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString()
}

export type SourceSummary = {
  id: string
  name: string
  website: string
  active: boolean
  petCount: number
  lastScrapedAt: string | null
}

export async function getSourceSummaries(): Promise<SourceSummary[]> {
  const client = createServerClient()

  const sheltersPromise = client.from('shelters').select('id, name, website, active').order('name')
  const countsPromise = client
    .from('pets')
    .select('source', { count: 'exact', head: false })
    .in('status', ['available', 'pending'])
  const runsPromise = client
    .from('scraper_runs')
    .select('source, finished_at, status')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(200)

  const [shelters, counts, runs] = await Promise.all([sheltersPromise, countsPromise, runsPromise])
  if (shelters.error) throw new Error(`getSourceSummaries shelters: ${shelters.error.message}`)
  if (counts.error) throw new Error(`getSourceSummaries counts: ${counts.error.message}`)
  if (runs.error) throw new Error(`getSourceSummaries runs: ${runs.error.message}`)

  const countsBySource = new Map<string, number>()
  for (const row of (counts.data ?? []) as { source: string }[]) {
    countsBySource.set(row.source, (countsBySource.get(row.source) ?? 0) + 1)
  }

  const lastRunBySource = new Map<string, string>()
  for (const row of (runs.data ?? []) as { source: string; finished_at: string | null }[]) {
    if (!row.finished_at) continue
    if (!lastRunBySource.has(row.source)) lastRunBySource.set(row.source, row.finished_at)
  }

  return (
    (shelters.data ?? []) as { id: string; name: string; website: string; active: boolean }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    website: row.website,
    active: row.active,
    petCount: countsBySource.get(row.id) ?? 0,
    lastScrapedAt: lastRunBySource.get(row.id) ?? null,
  }))
}

export type HealthSummary = {
  db: 'ok' | 'down'
  lastScraperRun: {
    source: string
    status: string
    finishedAt: string | null
  } | null
}

export async function getHealthSummary(): Promise<HealthSummary> {
  const client = createServerClient()
  try {
    const { data, error } = await client
      .from('scraper_runs')
      .select('source, status, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
    if (error) throw error
    const last = (data ?? [])[0] as
      | { source: string; status: string; finished_at: string | null }
      | undefined
    return {
      db: 'ok',
      lastScraperRun: last
        ? { source: last.source, status: last.status, finishedAt: last.finished_at }
        : null,
    }
  } catch {
    return { db: 'down', lastScraperRun: null }
  }
}
