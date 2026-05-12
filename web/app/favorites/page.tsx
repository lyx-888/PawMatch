import { AppHeader } from '@/components/layout/AppHeader'
import { FavoritesClient } from '@/components/favorites/FavoritesClient'
import { FavoritesReadinessSnippet } from '@/components/readiness/FavoritesReadinessSnippet'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function FavoritesPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Your favorites</h1>
        <p className="text-sm text-stone-600">
          Saved on this device. They&apos;ll move with you when you create an account.
        </p>
        <FavoritesReadinessSnippet />
        <FavoritesClient />
      </main>
    </div>
  )
}
