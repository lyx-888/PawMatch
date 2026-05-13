'use client'

import { PetGalleryCarousel } from '@/components/pet/PetGalleryCarousel'
import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { Tier } from '@/lib/matching/types'
import { useMatchScore } from '@/lib/matching/use-score'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
  className?: string
}

const TIER_FG: Record<Tier, string> = {
  great: 'var(--sage)',
  good: 'var(--ink)',
  stretch: 'var(--amber-tone)',
  hard_fail: 'var(--danger)',
}

export function SwipeCard({ pet, className }: Props): React.ReactElement {
  const age = formatAge(pet.ageMonths)
  const breed = pet.breed?.trim() || null
  const species = titleCase(pet.species)
  const size = pet.size ? titleCase(pet.size) : null
  const sourceLabel = pet.source.replace(/_/g, ' ')

  const match = useMatchScore(pet)
  const tier = match?.tier
  const isHardFail = tier === 'hard_fail'
  const tierColor = tier ? TIER_FG[tier] : null
  const tierLabel = tier ? t(`match.tier.${tier}`) : null
  const positiveReason = match?.reasons.find((r) => r.kind === 'positive')?.message
  const hardFailReason = match?.reasons.find((r) => r.kind === 'risk')?.message

  // Three short facts surfaced as pills on the dark overlay — same set the
  // handoff card shows (breed · age · size).
  const facts = [breed, age, size].filter((v): v is string => Boolean(v))

  return (
    <article
      className={cn(
        'relative flex h-full w-full overflow-hidden rounded-[22px] bg-white',
        className,
      )}
      style={{
        boxShadow: '0 24px 50px -18px rgba(40,32,24,0.32), 0 6px 16px rgba(40,32,24,0.10)',
      }}
    >
      {/* Full-bleed photo. The carousel keeps its tap-zones for navigating
          between photos and its top-dot indicators. */}
      <div className={cn('absolute inset-0', isHardFail && 'opacity-[0.55] grayscale-[0.7]')}>
        <PetGalleryCarousel
          photos={pet.photoUrls}
          alt={t('pet_card.photo_alt', {
            name: pet.name,
            species: species ?? t('pet_card.species_fallback'),
          })}
          className="!aspect-auto h-full"
        />
      </div>

      {/* Bottom gradient for legibility under the white text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 100%)',
        }}
      />

      {/* Top-left: restrained tier badge — dot + label on frosted white. */}
      {tier && tierColor && tierLabel && (
        <span
          role="status"
          aria-label={t('match.tier_aria', { tier: tierLabel })}
          className="absolute top-6 left-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            background: 'rgba(255,255,255,0.94)',
            color: tierColor,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full"
            style={{ background: tierColor }}
          />
          {tierLabel}
        </span>
      )}

      {/* Hard-fail constraint banner — floats over the photo near vertical
          centre so the user can't miss the disqualifying reason. The card is
          dimmed (not hidden) per requirements §2.3.2. */}
      {isHardFail && hardFailReason && (
        <div
          className="absolute inset-x-4 z-10 rounded-2xl bg-white/95 p-4 shadow-lg"
          style={{ top: '38%' }}
        >
          <div
            className="mb-1 text-[10px] font-bold tracking-[0.08em] uppercase"
            style={{ color: 'var(--danger)' }}
          >
            {tierLabel}
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {hardFailReason}
          </div>
        </div>
      )}

      {/* Bottom info layered on the dark overlay. Name+age+breed, source,
          one positive reason (or bio fallback), facts pills. */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-5 pt-6 pb-5 text-white">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <h2 className="text-[34px] leading-none font-medium tracking-[-0.5px]">{pet.name}</h2>
          {(age || breed) && (
            <span className="text-base font-medium opacity-85">
              {[age, breed].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs font-medium capitalize opacity-85">{sourceLabel}</p>
        {positiveReason ? (
          <p className="mb-3 line-clamp-2 max-w-[320px] text-[13px] leading-snug opacity-95">
            {positiveReason}
          </p>
        ) : pet.description ? (
          <p className="mb-3 line-clamp-2 max-w-[320px] text-[13px] leading-snug opacity-95">
            {pet.description}
          </p>
        ) : null}
        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide backdrop-blur"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '0.5px solid rgba(255,255,255,0.28)',
                  color: 'rgba(255,255,255,0.94)',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
