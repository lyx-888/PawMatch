import { jsonResponse } from '@/lib/api/responses'
import { getSourceSummaries } from '@/lib/db/pets'

export async function GET(): Promise<Response> {
  const sources = await getSourceSummaries()
  const totalPets = sources.reduce((sum, s) => sum + s.petCount, 0)
  const lastScrapedAt =
    sources
      .map((s) => s.lastScrapedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null
  return jsonResponse({ totalPets, lastScrapedAt, sources })
}
