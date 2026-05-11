'use client'

import Link from 'next/link'

import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
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

  return (
    <article
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/5',
        className,
      )}
    >
      <PetGalleryCarousel photos={pet.photoUrls} alt={`${pet.name}, a ${species ?? 'pet'}`} />

      <div className="flex flex-1 flex-col gap-3 p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{pet.name}</h2>
            {facts.length > 0 && <p className="mt-1 text-sm text-stone-600">{facts.join(' · ')}</p>}
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 capitalize">
            {pet.source.replace(/_/g, ' ')}
          </span>
        </header>

        {pet.description && (
          <p className="line-clamp-3 text-sm text-stone-700">{pet.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between text-sm">
          <Link
            href={`/pets/${pet.id}`}
            className="font-medium text-amber-700 underline-offset-2 hover:underline focus-visible:underline"
          >
            More about {pet.name}
          </Link>
        </div>
      </div>
    </article>
  )
}
