import { PossiblyYoursSection } from '@/components/picks/PossiblyYoursSection'
import { SwipeFeed } from '@/components/swipe/SwipeFeed'
import { getCurrentUser } from '@/lib/auth/session'
import { getTodaysPicksForUser } from '@/lib/db/daily-picks'

export const dynamic = 'force-dynamic'

// The home page is the swipe surface — nothing below the fold, so we lock it
// to the viewport (no scroll). The wrapper fills the shell's main grid area,
// `overflow-hidden` clips any overflow on small phones, and the swipe stack's
// card uses flex-1 (rather than aspect-ratio) so it adapts to the available
// height instead of forcing scroll.
export default async function Home(): Promise<React.ReactElement> {
  const user = await getCurrentUser()
  const picks = user ? await getTodaysPicksForUser(user.id) : []

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
        <PossiblyYoursSection pets={picks} />
        <SwipeFeed />
      </main>
    </div>
  )
}
