import Link from 'next/link'

import { cn } from '@/lib/cn'
import { relativeFromNow } from '@/lib/format'
import { t } from '@/lib/i18n'

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
  const shelterWord =
    activeShelterCount === 1 ? t('header.shelter_singular') : t('header.shelter_plural')
  const lineKey = totalPets === 1 ? 'header.pets_looking_one' : 'header.pets_looking_other'
  return (
    <header
      className={cn('flex flex-col gap-2 border-b border-stone-200 bg-white px-4 py-4', className)}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight text-stone-900">
          {t('app.brand')} <span className="text-amber-600">{t('app.brand_suffix')}</span>
        </Link>
        <nav
          aria-label={t('nav.primary_label')}
          className="flex items-center gap-4 text-sm font-medium text-stone-700"
        >
          <Link href="/search" className="hover:text-stone-900">
            {t('nav.search')}
          </Link>
          <Link href="/favorites" className="hover:text-stone-900">
            {t('nav.favorites')}
          </Link>
        </nav>
      </div>
      <p className="text-xs text-stone-600">
        {t(lineKey, {
          count: totalPets.toLocaleString('en-SG'),
          shelters: activeShelterCount,
          shelterWord,
        })}
        {(() => {
          const time = relativeFromNow(lastScrapedAt)
          if (!time) return null
          return <> · {t('header.last_updated', { time })}</>
        })()}
      </p>
    </header>
  )
}
