import { AppHeader } from '@/components/layout/AppHeader'
import { SearchClient } from '@/components/search/SearchClient'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function SearchPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Search</h1>
        <p className="text-sm text-stone-600">
          Filter by species, size, age, or shelter. Tap a pet to see the full profile.
        </p>
        <SearchClient
          // Only list shelters that actually have pets right now — filtering by
          // a placeholder shelter (Phase 1 only has SPCA wired) would always
          // return zero, which reads as a broken filter.
          sources={sources
            .filter((s) => s.active && s.petCount > 0)
            .map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </div>
  )
}
