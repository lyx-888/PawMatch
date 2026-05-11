import { notFound } from 'next/navigation'

import { AppHeader } from '@/components/layout/AppHeader'
import { PetDetailActions } from '@/components/pet/PetDetailActions'
import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { formatAge, relativeFromNow, titleCase } from '@/lib/format'
import { getPetById, getSourceSummaries } from '@/lib/db/pets'

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

  const totalPets = sources.reduce((sum, s) => sum + s.petCount, 0)
  const lastScrapedAt =
    sources
      .map((s) => s.lastScrapedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null

  // Server-rendered staleness is per-request, intentionally a function of wall time.
  // eslint-disable-next-line react-hooks/purity
  const isStale = Date.now() - new Date(pet.lastSeenAt).getTime() > STALE_AFTER_MS
  const attributes: Array<{ label: string; value: string | null }> = [
    { label: 'Species', value: titleCase(pet.species) },
    { label: 'Breed', value: pet.breed },
    { label: 'Sex', value: titleCase(pet.sex) },
    { label: 'Age', value: formatAge(pet.ageMonths) },
    { label: 'Size', value: titleCase(pet.size) },
    {
      label: 'HDB-approved',
      value: pet.hdbApproved === null ? null : pet.hdbApproved ? 'Yes' : 'Not confirmed',
    },
    { label: 'Tags', value: pet.tags.length > 0 ? pet.tags.join(', ') : null },
  ].filter((row) => row.value !== null) as Array<{ label: string; value: string }>

  return (
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader totalPets={totalPets} lastScrapedAt={lastScrapedAt} />
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
