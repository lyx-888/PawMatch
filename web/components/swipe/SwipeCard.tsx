'use client'

import Link from 'next/link'

import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { ReasonList } from '@/components/matching/ReasonList'
import { TierBadge } from '@/components/matching/TierBadge'
import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useMatchScore } from '@/lib/matching/use-score'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
  className?: string
}

export function SwipeCard({ pet, className }: Props): React.ReactElement {
  const age = formatAge(pet.ageMonths)
  const breed = pet.breed?.trim() || null
  const species = titleCase(pet.species)
  const size = titleCase(pet.size)
  const sex = titleCase(pet.sex)
  const facts = [breed, age, size, sex].filter(Boolean)

  const match = useMatchScore(pet)
  const isHardFail = match?.tier === 'hard_fail'

  return (
    <article
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/5',
        // Hard-fail pets are dimmed but never hidden — the user still
        // sees them with an explicit reason per §2.3.2.
        isHardFail && 'opacity-70',
        className,
      )}
    >
      <PetGalleryCarousel
        photos={pet.photoUrls}
        alt={t('pet_card.photo_alt', {
          name: pet.name,
          species: species ?? t('pet_card.species_fallback'),
        })}
      />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{pet.name}</h2>
            {facts.length > 0 && <p className="mt-1 text-sm text-stone-600">{facts.join(' · ')}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {match && <TierBadge tier={match.tier} />}
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 capitalize">
              {pet.source.replace(/_/g, ' ')}
            </span>
          </div>
        </header>

        {match && match.reasons.length > 0 && <ReasonList reasons={match.reasons} limit={2} />}

        {!match?.reasons.length && pet.description && (
          <p className="line-clamp-3 text-sm text-stone-700">{pet.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between text-sm">
          <Link
            href={`/pets/${pet.id}`}
            className="font-medium text-amber-700 underline-offset-2 hover:underline focus-visible:underline"
          >
            {t('pet_card.more_about', { name: pet.name })}
          </Link>
        </div>
      </div>
    </article>
  )
}
