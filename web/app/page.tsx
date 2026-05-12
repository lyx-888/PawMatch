import { AppHeader } from '@/components/layout/AppHeader'
import { PossiblyYoursSection } from '@/components/picks/PossiblyYoursSection'
import { SwipeFeed } from '@/components/swipe/SwipeFeed'
import { getCurrentUser } from '@/lib/auth/session'
import { getTodaysPicksForUser } from '@/lib/db/daily-picks'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function Home(): Promise<React.ReactElement> {
  const [user, sources] = await Promise.all([getCurrentUser(), getSourceSummaries()])
  const header = summarizeForHeader(sources)
  // Anonymous users have no picks; skip the DB hit entirely.
  const picks = user ? await getTodaysPicksForUser(user.id) : []

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        <PossiblyYoursSection pets={picks} />
        <SwipeFeed />
      </main>
    </div>
  )
}
