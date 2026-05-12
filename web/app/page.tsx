import { AppHeader } from '@/components/layout/AppHeader'
import { SwipeFeed } from '@/components/swipe/SwipeFeed'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'

export const dynamic = 'force-dynamic'

export default async function Home(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        <SwipeFeed />
      </main>
    </div>
  )
}
