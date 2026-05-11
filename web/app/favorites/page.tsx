import { AppHeader } from '@/components/layout/AppHeader'
import { FavoritesClient } from '@/components/favorites/FavoritesClient'
import { getSourceSummaries } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function FavoritesPage(): Promise<React.ReactElement> {
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
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Your favorites</h1>
        <p className="text-sm text-stone-600">
          Saved on this device. They&apos;ll move with you when you create an account.
        </p>
        <FavoritesClient />
      </main>
    </div>
  )
}
