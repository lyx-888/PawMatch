import Link from 'next/link'

import { cn } from '@/lib/cn'
import { relativeFromNow } from '@/lib/format'

type Props = {
  totalPets: number
  // Number of shelters currently contributing pets — not the count of seed
  // rows in the `shelters` table (Phase 1 only has SPCA wired up; the other
  // 8 are placeholders for upcoming scrapers).
  activeShelterCount: number
  lastScrapedAt: string | null
  className?: string
}

export function AppHeader({
  totalPets,
  activeShelterCount,
  lastScrapedAt,
  className,
}: Props): React.ReactElement {
  return (
    <header
      className={cn('flex flex-col gap-2 border-b border-stone-200 bg-white px-4 py-4', className)}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-stone-900">
          PawMatch <span className="text-amber-600">SG</span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex items-center gap-4 text-sm font-medium text-stone-700"
        >
          <Link href="/search" className="hover:text-stone-900">
            Search
          </Link>
          <Link href="/favorites" className="hover:text-stone-900">
            Favorites
          </Link>
        </nav>
      </div>
      <p className="text-xs text-stone-600">
        <span className="font-semibold text-stone-900">{totalPets.toLocaleString('en-SG')}</span>{' '}
        pets looking for homes across {activeShelterCount}{' '}
        {activeShelterCount === 1 ? 'shelter' : 'shelters'}
        {lastScrapedAt && <> · last updated {relativeFromNow(lastScrapedAt)}</>}
      </p>
    </header>
  )
}
