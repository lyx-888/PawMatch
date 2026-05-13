'use client'

import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { track } from '@/lib/analytics'
import { titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useFavorites } from '@/lib/local-state'
import type { Reason, Tier } from '@/lib/matching/types'
import { useMatchScore } from '@/lib/matching/use-score'
import type { Pet } from '@/types/pet'

// Visual translation of the prototype's DetailSheet — drag handle, hero
// photo, tier dot line, big display name, inline facts, prose bio,
// "How {name} fits your home" reasoning card, facts pills, shelter row,
// source caveat, primary CTA (ink) + secondary CTA (ghost).
//
// Not wired as an actual bottom-sheet modal — the route stays full-page
// for deep linking, but the visual language matches the sheet design.
// A future change can introduce an intercepting route (`(.)pets/[id]`) to
// render this as an overlay when navigated from the swipe feed.

type Props = {
  pet: Pet
  sourceLabel: string
  listedAgo: string | null
  isStale: boolean
  headerFacts: string[]
  factsPills: string[]
}

const TIER_COLOR: Record<Tier, string> = {
  great: 'var(--sage)',
  good: 'var(--ink)',
  stretch: 'var(--amber-tone)',
  hard_fail: 'var(--danger)',
}

export function PetDetailSheetClient({
  pet,
  sourceLabel,
  listedAgo,
  isStale,
  headerFacts,
  factsPills,
}: Props): React.ReactElement {
  const match = useMatchScore(pet)
  const favorites = useFavorites()
  const isFavorite = favorites.has(pet.id)

  const tier = match?.tier
  const tierColor = tier ? TIER_COLOR[tier] : null

  return (
    <article className="flex flex-col gap-3">
      {/* Drag handle is owned by the modal chrome (PetDetailSheetModal),
          where it's functional (tap+drag down to dismiss). The full-page
          route doesn't need a handle since it isn't a sheet. */}

      {/* Hero photo — landscape-ish to give the page a horizon line rather
          than the swipe card's tall portrait. The carousel still renders
          its top dot indicators on top. */}
      <PetGalleryCarousel
        photos={pet.photoUrls}
        alt={t('pet_card.photo_alt', {
          name: pet.name,
          species: titleCase(pet.species) ?? t('pet_card.species_fallback'),
        })}
        rounded
        className="!aspect-[7/3]"
      />

      <header className="flex flex-col gap-0.5">
        {tier && tierColor && (
          <div
            className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.04em] uppercase"
            style={{ color: tierColor }}
          >
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full"
              style={{ background: tierColor }}
            />
            {t(`match.tier.${tier}`)}
          </div>
        )}
        {/* Per prototype: 34px / weight 500 / tight letter-spacing — NOT the
            .display utility (which is 600). The lighter weight reads calmer
            against the dense reasoning card below. */}
        <h1
          className="text-[34px] font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.8px', lineHeight: 1.05 }}
        >
          {pet.name}
        </h1>
        {headerFacts.length > 0 && (
          <p className="text-[14px]" style={{ color: 'var(--mute)' }}>
            {headerFacts.join(' · ')}
          </p>
        )}
      </header>

      {pet.description && (
        <p
          className="text-[15px] whitespace-pre-line"
          style={{ color: 'var(--ink)', lineHeight: 1.55 }}
        >
          {pet.description}
        </p>
      )}

      {/* The reasoning card explains *fit* — actual signal from the listing
          + the user's profile. "Compatibility with X not stated — ask the
          shelter" reasons (template names ending `_unknown`) are meta-
          disclosures about missing info, not about fit, so they're filtered
          out here. If the filtered list is empty, the section hides
          entirely. The swipe card already filters by kind so this only
          affects the detail surface. */}
      {(() => {
        const fitReasons = match?.reasons.filter((r) => !r.template.endsWith('_unknown')) ?? []
        if (fitReasons.length === 0) return null
        return (
          <section
            className="rounded-2xl px-[18px] py-4"
            style={{
              background: 'var(--surface)',
              boxShadow: 'inset 0 0 0 1px var(--muteLine)',
            }}
          >
            <h2
              className="mb-3 text-[10px] font-bold tracking-[0.08em] uppercase"
              style={{ color: 'var(--mute)' }}
            >
              {t('pet_sheet.reasoning_title', { name: pet.name })}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {fitReasons.map((reason, i) => (
                <li
                  key={`${reason.template}-${i}`}
                  className="flex items-start gap-2.5 text-[13.5px]"
                  style={{ lineHeight: 1.4 }}
                >
                  <ReasonIcon kind={reason.kind} />
                  <span style={{ color: 'var(--ink)' }}>{reason.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })()}

      {factsPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {factsPills.map((f) => (
            <span
              key={f}
              className="inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold capitalize"
              style={{
                background: 'var(--surface)',
                color: 'var(--ink)',
                boxShadow: 'inset 0 0 0 1px var(--muteLine)',
              }}
            >
              {f.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-3 rounded-2xl p-3.5"
        style={{
          background: 'var(--surface)',
          boxShadow: 'inset 0 0 0 1px var(--muteLine)',
        }}
      >
        {/* Shelter logo — primarySoft tile with primary-coloured acronym,
            matches the prototype's warm clay treatment (not the heavier
            ink/white square the rest of the app uses for nav). */}
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold tracking-[0.04em]"
          style={{ background: 'var(--primarySoft)', color: 'var(--primary)' }}
        >
          {sourceLabel.replace(/[^A-Z]/g, '').slice(0, 4) || sourceLabel.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
            {sourceLabel}
          </span>
          {listedAgo && (
            <span className="text-xs" style={{ color: 'var(--mute)' }}>
              listed {listedAgo}
              {isStale && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--amber-tone)' }}>
                    {t('pet_detail.verify_on_shelter')}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--mute)' }}>
        {t('pet_sheet.source_caveat', { source: sourceLabel })}
      </p>

      <div className="flex flex-col gap-1.5 pt-2">
        <a
          href={pet.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('handoff_clicked', { pet_id: pet.id, source: pet.source })}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] px-5 py-3.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
          style={{ background: 'var(--ink)', color: '#fff' }}
        >
          {t('pet_detail.view_on', { source: sourceLabel })}
          <ExternalLinkIcon />
        </a>
        <button
          type="button"
          onClick={() => {
            if (isFavorite) favorites.remove(pet.id)
            else {
              const result = favorites.add(pet.id)
              if (result === 'added') track('pet_favorited', { pet_id: pet.id, source: pet.source })
            }
          }}
          disabled={!isFavorite && favorites.capReached}
          className="w-full rounded-[14px] px-5 py-3 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] disabled:opacity-50"
          style={{
            background: 'transparent',
            color: 'var(--ink)',
          }}
        >
          {isFavorite ? t('pet_sheet.saved_secondary') : t('pet_sheet.save_secondary')}
        </button>
      </div>
    </article>
  )
}

function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function ReasonIcon({ kind }: { kind: Reason['kind'] }): React.ReactElement {
  if (kind === 'positive') {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--sageSoft)', color: 'var(--sage)' }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    )
  }
  if (kind === 'risk') {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--dangerSoft)', color: 'var(--danger)' }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16.5" x2="12" y2="16.5" />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: 'var(--surfaceAlt)', color: 'var(--mute)' }}
    >
      <span className="inline-block size-1 rounded-full" style={{ background: 'currentColor' }} />
    </span>
  )
}
