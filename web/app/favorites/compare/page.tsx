import { notFound, redirect } from 'next/navigation'

import { CompareView } from '@/components/favorites/CompareView'
import { AppHeader } from '@/components/layout/AppHeader'
import { getPetById, getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import type { Pet } from '@/types/pet'

type Props = {
  searchParams: Promise<{ ids?: string | string[] }>
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMPARE_MIN = 2
const COMPARE_MAX = 3

export default async function CompareFavoritesPage({
  searchParams,
}: Props): Promise<React.ReactElement> {
  const sp = await searchParams
  const raw = Array.isArray(sp.ids) ? sp.ids.join(',') : (sp.ids ?? '')
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    // Dedupe in case the link is hand-edited or copied twice.
    .filter((id, idx, arr) => arr.indexOf(id) === idx)

  if (ids.length < COMPARE_MIN) {
    // Fewer than 2 valid ids — nothing to compare. Send the user back to
    // the favorites list rather than rendering an awkward empty grid.
    redirect('/favorites')
  }
  if (ids.length > COMPARE_MAX) notFound()

  const [pets, sources] = await Promise.all([
    Promise.all(ids.map((id) => getPetById(id))),
    getSourceSummaries(),
  ])

  const resolved = pets.filter((p): p is Pet => Boolean(p))
  if (resolved.length < COMPARE_MIN) {
    // All requested pets are gone (adopted, removed). Bounce back to the
    // list — the missing-IDs warning there will explain.
    redirect('/favorites')
  }

  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <CompareView pets={resolved} />
      </main>
    </div>
  )
}
