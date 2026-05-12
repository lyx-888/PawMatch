'use client'

import Link from 'next/link'
import { useMemo } from 'react'

import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useMatchScore } from '@/lib/matching/use-score'
import type { MatchScore, Tier } from '@/lib/matching/types'
import type { Pet } from '@/types/pet'

type Props = {
  pets: Pet[]
}

type Row = {
  label: string
  render: (pet: Pet, match: MatchScore | null) => React.ReactNode
}

// Side-by-side compare table for 2–3 favorites. Lays out as a horizontally
// scrolling card row on mobile, fitting into the standard 3xl page max-width
// on larger screens. Tap any card to open the pet detail.
export function CompareView({ pets }: Props): React.ReactElement {
  const dash = t('pet_detail.value.dash')
  const rows = useMemo<Row[]>(
    () => [
      {
        label: t('pet_detail.field.match'),
        render: (_pet, match) =>
          match ? <TierPill tier={match.tier} score={match.score} /> : dash,
      },
      {
        label: t('pet_detail.field.species'),
        render: (pet) => titleCase(pet.species) ?? dash,
      },
      {
        label: t('pet_detail.field.breed'),
        render: (pet) => pet.breed ?? dash,
      },
      {
        label: t('pet_detail.field.age'),
        render: (pet) => formatAge(pet.ageMonths) ?? dash,
      },
      {
        label: t('pet_detail.field.size'),
        render: (pet) =>
          [titleCase(pet.size), pet.weightKg ? `${pet.weightKg.toFixed(1)} kg` : null]
            .filter(Boolean)
            .join(' · ') || dash,
      },
      {
        label: t('pet_detail.field.energy'),
        render: (pet) => titleCase(pet.energyLevel) ?? dash,
      },
      {
        label: t('pet_detail.field.hdb_approved'),
        render: (pet) =>
          pet.hdbApproved === null
            ? dash
            : pet.hdbApproved
              ? t('pet_detail.value.yes')
              : t('pet_detail.value.no'),
      },
      {
        label: t('pet_detail.field.tags'),
        render: (pet) =>
          pet.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {pet.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700"
                >
                  {tag.replace(/_/g, ' ')}
                </span>
              ))}
            </span>
          ) : (
            dash
          ),
      },
      {
        label: t('pet_detail.field.source'),
        render: (pet) => <span className="capitalize">{pet.source.replace(/_/g, ' ')}</span>,
      },
      {
        label: t('pet_detail.field.status'),
        render: (pet) => <StatusPill status={pet.status} />,
      },
    ],
    [dash],
  )

  return (
    <section aria-labelledby="compare-heading" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="compare-heading" className="text-2xl font-bold tracking-tight text-stone-900">
          {t('compare.heading')}
        </h1>
        <Link href="/favorites" className="text-sm text-amber-700 hover:text-amber-800">
          {t('compare.back')}
        </Link>
      </header>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        {/* Each pet column is fixed width on small screens so two-or-three
            columns can scroll horizontally without truncating the values. */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `minmax(96px, 120px) repeat(${pets.length}, minmax(180px, 1fr))`,
          }}
          role="table"
          aria-label={t('compare.table_aria')}
        >
          <div className="sticky left-0 bg-stone-50" role="rowheader" aria-hidden="true" />
          {pets.map((pet) => (
            <PetColumnHeader key={pet.id} pet={pet} />
          ))}

          {rows.map((row) => (
            <CompareRow key={row.label} row={row} pets={pets} />
          ))}
        </div>
      </div>
    </section>
  )
}

function CompareRow({ row, pets }: { row: Row; pets: Pet[] }): React.ReactElement {
  return (
    <>
      <div
        role="rowheader"
        className="sticky left-0 flex items-center bg-stone-50 pr-2 text-xs font-medium tracking-wide text-stone-500 uppercase"
      >
        {row.label}
      </div>
      {pets.map((pet) => (
        <PetCell key={pet.id} pet={pet} row={row} />
      ))}
    </>
  )
}

function PetCell({ pet, row }: { pet: Pet; row: Row }): React.ReactElement {
  // Each cell subscribes to the match score so the badge updates live as the
  // user changes their profile draft from elsewhere — the score hook is
  // cheap and pet-keyed so this fan-out is fine.
  const match = useMatchScore(pet)
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900">
      {row.render(pet, match)}
    </div>
  )
}

function PetColumnHeader({ pet }: { pet: Pet }): React.ReactElement {
  return (
    <Link
      href={`/pets/${pet.id}`}
      className="group flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200 transition hover:ring-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-stone-100">
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
      <p className="px-1 text-sm font-semibold text-stone-900">{pet.name}</p>
    </Link>
  )
}

// Compact tier pill that fits the table cell — full TierBadge is too tall.
const TIER_CLASS: Record<Tier, string> = {
  great: 'bg-emerald-100 text-emerald-900',
  good: 'bg-amber-100 text-amber-900',
  stretch: 'bg-stone-100 text-stone-700',
  hard_fail: 'bg-rose-100 text-rose-900',
}

function TierPill({ tier, score }: { tier: Tier; score: number }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        TIER_CLASS[tier],
      )}
    >
      {t(`match.tier_short.${tier}`)}
      <span className="opacity-70">· {score}</span>
    </span>
  )
}

function StatusPill({ status }: { status: Pet['status'] }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
        status === 'available'
          ? 'bg-emerald-100 text-emerald-800'
          : status === 'pending'
            ? 'bg-amber-100 text-amber-900'
            : 'bg-stone-200 text-stone-700',
      )}
    >
      {status}
    </span>
  )
}
