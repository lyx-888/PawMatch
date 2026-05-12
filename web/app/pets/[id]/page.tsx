import { notFound } from 'next/navigation'

import { AppHeader } from '@/components/layout/AppHeader'
import { FavoriteNote } from '@/components/favorites/FavoriteNote'
import { PetMatchSection } from '@/components/matching/PetMatchSection'
import { ProgressiveQuestionCard } from '@/components/onboarding/ProgressiveQuestionCard'
import { PetDetailActions } from '@/components/pet/PetDetailActions'
import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { PetReadinessSnippet } from '@/components/readiness/PetReadinessSnippet'
import { formatAge, relativeFromNow, titleCase } from '@/lib/format'
import { getPetById, getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import type { ProgressiveContext } from '@/lib/onboarding/progressive'

type Props = {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export default async function PetDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (!isUuid) notFound()

  const [pet, sources] = await Promise.all([getPetById(id), getSourceSummaries()])
  if (!pet) notFound()

  const header = summarizeForHeader(sources)

  // Server-rendered staleness is per-request, intentionally a function of wall time.
  // eslint-disable-next-line react-hooks/purity
  const isStale = Date.now() - new Date(pet.lastSeenAt).getTime() > STALE_AFTER_MS
  // Progressive-profiling context derived from the pet on screen.
  // `special_needs` is the controlled-vocabulary tag the Phase 2.2 LLM
  // extractor writes when the description signals special-needs care.
  const progressiveContext: ProgressiveContext = {
    favoritesCount: 0,
    viewingPetSpecies: (['dog', 'cat', 'rabbit'] as const).includes(
      pet.species as 'dog' | 'cat' | 'rabbit',
    )
      ? (pet.species as 'dog' | 'cat' | 'rabbit')
      : 'other',
    viewingPetIsSpecialNeeds: pet.tags.includes('special_needs'),
  }

  // Always render every standard attribute so the panel layout is consistent
  // across pets — shelters frequently omit fields and we want adopters to see
  // the gap rather than a Details card that silently shrinks.
  const attributes: Array<{ label: string; value: string }> = [
    { label: 'Species', value: titleCase(pet.species) ?? 'Unknown' },
    { label: 'Breed', value: pet.breed ?? 'Unknown' },
    { label: 'Sex', value: titleCase(pet.sex) ?? 'Unknown' },
    { label: 'Age', value: formatAge(pet.ageMonths) ?? 'Unknown' },
    { label: 'Size', value: titleCase(pet.size) ?? 'Unknown' },
    {
      label: 'HDB-approved',
      value: pet.hdbApproved === null ? 'Unknown' : pet.hdbApproved ? 'Yes' : 'No',
    },
    { label: 'Tags', value: pet.tags.length > 0 ? pet.tags.join(', ') : 'None' },
  ]

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-6">
        <section>
          <PetGalleryCarousel
            photos={pet.photoUrls}
            alt={`${pet.name}, ${titleCase(pet.species) ?? 'pet'}`}
            rounded
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-stone-900">{pet.name}</h1>
            <StatusBadge status={pet.status} />
          </div>
          <p className="text-sm text-stone-600 capitalize">
            {pet.source.replace(/_/g, ' ')} · listed {relativeFromNow(pet.firstSeenAt)}
            {isStale && (
              <>
                {' '}
                · <span className="font-medium text-amber-700">verify on shelter site</span>
              </>
            )}
          </p>
        </section>

        <PetDetailActions pet={pet} />

        <FavoriteNote petId={pet.id} petName={pet.name} />

        <PetMatchSection pet={pet} />

        <PetReadinessSnippet pet={pet} />

        <ProgressiveQuestionCard context={progressiveContext} />

        <section aria-labelledby="about">
          <h2 id="about" className="text-lg font-semibold text-stone-900">
            About {pet.name}
          </h2>
          {pet.description ? (
            <p className="mt-2 text-sm whitespace-pre-line text-stone-700">{pet.description}</p>
          ) : (
            <p className="mt-2 text-sm text-stone-500">No description provided by the shelter.</p>
          )}
        </section>

        <section aria-labelledby="attributes">
          <h2 id="attributes" className="text-lg font-semibold text-stone-900">
            Details
          </h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {attributes.map((row) => (
              <div key={row.label} className="flex flex-col">
                <dt className="text-stone-500">{row.label}</dt>
                <dd className="text-stone-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const color =
    status === 'available'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'pending'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-stone-200 text-stone-700'
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  )
}
