import Link from 'next/link'

import { formatAge, titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { Pet } from '@/types/pet'

type Props = {
  pets: Pet[]
}

// "Possibly Yours" daily pick strip on the home page, above the swipe stack.
// Renders nothing when the user is anonymous or has no picks for today —
// the home page is responsible for filtering that out before mounting.
export function PossiblyYoursSection({ pets }: Props): React.ReactElement | null {
  if (pets.length === 0) return null
  return (
    <section
      aria-labelledby="possibly-yours-heading"
      className="-mx-4 flex flex-col gap-3 border-b border-stone-200 bg-white px-4 py-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="possibly-yours-heading"
          className="text-sm font-semibold tracking-wide text-stone-900 uppercase"
        >
          {t('possibly_yours.title')}
        </h2>
        <span className="text-xs text-stone-500">{t('possibly_yours.subtitle')}</span>
      </div>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" role="list">
        {pets.map((pet) => (
          <li key={pet.id} className="w-32 shrink-0">
            <Link
              href={`/pets/${pet.id}`}
              className="group flex flex-col gap-1.5 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:ring-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-stone-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pet.photoUrls[0] ?? '/pet-placeholder.svg'}
                  alt={pet.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget
                    if (!img.src.endsWith('/pet-placeholder.svg')) {
                      img.src = '/pet-placeholder.svg'
                    }
                  }}
                />
              </div>
              <div className="px-2 pb-2">
                <p className="truncate text-sm font-semibold text-stone-900">{pet.name}</p>
                <p className="truncate text-[11px] text-stone-600">
                  {[titleCase(pet.species), formatAge(pet.ageMonths)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
