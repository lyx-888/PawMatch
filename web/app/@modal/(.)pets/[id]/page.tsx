import { notFound } from 'next/navigation'

import { FavoriteNote } from '@/components/favorites/FavoriteNote'
import { ProgressiveQuestionCard } from '@/components/onboarding/ProgressiveQuestionCard'
import { PetDetailSheetClient } from '@/components/pet/PetDetailSheetClient'
import { PetDetailSheetModal } from '@/components/pet/PetDetailSheetModal'
// Readiness snippets (Phase 2.10) are intentionally hidden — see comment in
// app/pets/[id]/page.tsx for re-enabling instructions.
import { getPetById } from '@/lib/db/pets'
import { formatAge, relativeFromNow, titleCase } from '@/lib/format'
import type { ProgressiveContext } from '@/lib/onboarding/progressive'

type Props = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 48 * 60 * 60 * 1000

// Intercepting route — when the user taps the info button on /, this slot
// activates with the pet detail rendered inside a bottom-sheet modal that
// overlays the swipe surface (matches the prototype's DetailSheet).
//
// Direct URL navigation to /pets/[id] (refresh, share, deep link) still
// uses the full page at app/pets/[id]/page.tsx — the modal version is a
// UX enhancement for in-app navigation only.

export default async function PetDetailModal({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (!isUuid) notFound()

  const pet = await getPetById(id)
  if (!pet) notFound()

  // eslint-disable-next-line react-hooks/purity
  const isStale = Date.now() - new Date(pet.lastSeenAt).getTime() > STALE_AFTER_MS

  const progressiveContext: ProgressiveContext = {
    favoritesCount: 0,
    viewingPetSpecies: (['dog', 'cat', 'rabbit'] as const).includes(
      pet.species as 'dog' | 'cat' | 'rabbit',
    )
      ? (pet.species as 'dog' | 'cat' | 'rabbit')
      : 'other',
    viewingPetIsSpecialNeeds: pet.tags.includes('special_needs'),
  }

  const sourceLabel = pet.source.replace(/_/g, ' ').toUpperCase()
  const listedAgo = relativeFromNow(pet.firstSeenAt)
  const breed = pet.breed?.trim() || null
  const sex = titleCase(pet.sex)
  const age = formatAge(pet.ageMonths)
  const size = titleCase(pet.size)
  const weight = pet.weightKg ? `${pet.weightKg} kg` : null

  const headerFacts = [breed, sex, weight, age].filter((v): v is string => Boolean(v))
  const factsPills = [
    size,
    pet.hdbApproved === true ? 'HDB-approved' : null,
    ...pet.tags.slice(0, 4),
  ].filter((v): v is string => Boolean(v))

  return (
    <PetDetailSheetModal>
      <div className="flex flex-col gap-4 px-6 pt-2.5 pb-9">
        <PetDetailSheetClient
          pet={pet}
          sourceLabel={sourceLabel}
          listedAgo={listedAgo}
          isStale={isStale}
          headerFacts={headerFacts}
          factsPills={factsPills}
        />
        <ProgressiveQuestionCard context={progressiveContext} />
        <FavoriteNote petId={pet.id} petName={pet.name} />
      </div>
    </PetDetailSheetModal>
  )
}
