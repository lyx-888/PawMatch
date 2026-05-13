import { AppHeader } from '@/components/layout/AppHeader'
import { FavoritesClient } from '@/components/favorites/FavoritesClient'
// Readiness snippets (Phase 2.10) are intentionally hidden — see comment in
// app/pets/[id]/page.tsx for re-enabling instructions.
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function FavoritesPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="display text-2xl" style={{ color: 'var(--ink)' }}>
          {t('favorites.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--mute)' }}>
          {t('favorites.subtitle')}
        </p>
        <FavoritesClient />
      </main>
    </div>
  )
}
