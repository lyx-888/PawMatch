import { AppHeader } from '@/components/layout/AppHeader'
import { SearchClient } from '@/components/search/SearchClient'
import { getSourceSummaries } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function SearchPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const totalPets = sources.reduce((sum, s) => sum + s.petCount, 0)
  const lastScrapedAt =
    sources
      .map((s) => s.lastScrapedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader totalPets={totalPets} lastScrapedAt={lastScrapedAt} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Search</h1>
        <p className="text-sm text-stone-600">
          Filter by species, size, age, or shelter. Tap a pet to see the full profile.
        </p>
        <SearchClient
          sources={sources.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </div>
  )
}
