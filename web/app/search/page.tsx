import { AppHeader } from '@/components/layout/AppHeader'
import { SearchClient } from '@/components/search/SearchClient'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function SearchPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="display text-2xl" style={{ color: 'var(--ink)' }}>
          {t('search.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--mute)' }}>
          {t('search.subtitle')}
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
