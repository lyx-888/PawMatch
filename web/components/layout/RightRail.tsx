import Link from 'next/link'

import { getLongTimerPets, getRecentlyArrivedPets } from '@/lib/db/pets'
import { formatAge } from '@/lib/format'
import { t } from '@/lib/i18n'
import type { Pet } from '@/types/pet'

// Desktop-only right rail (340px). Async server component — fetches the
// rail data on every render. Each query returns at most 3 rows so the
// cost is bounded; if it shows up in a flamegraph we can wrap with
// React's `cache` for request-level dedupe or `unstable_cache` for cross-
// request memoization.

export async function RightRail(): Promise<React.ReactElement> {
  // The rail is rendered on every page (including /_not-found which is
  // statically prerendered). If DB env isn't configured at build time or
  // the query fails, fall back to a sources-only rail rather than crashing
  // the build.
  let recent: Pet[] = []
  let longTimers: Pet[] = []
  try {
    ;[recent, longTimers] = await Promise.all([getRecentlyArrivedPets(3), getLongTimerPets(3)])
  } catch {
    // Swallow — both stay empty arrays and the rail renders just the
    // sources card below.
  }

  return (
    <aside
      className="rail"
      aria-label={t('rail.label')}
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(8px)',
        borderLeft: '1px solid var(--muteLine)',
      }}
    >
      {recent.length > 0 && (
        <section>
          <RailSectionHead title={t('rail.recently_arrived')} meta={t('rail.recently_meta')} />
          <div className="flex flex-col gap-0.5">
            {recent.map((p) => (
              <RailPetRow key={p.id} pet={p} />
            ))}
          </div>
        </section>
      )}

      {longTimers.length > 0 && (
        <section>
          <RailSectionHead title={t('rail.still_waiting')} meta={t('rail.still_waiting_meta')} />
          <p className="m-0 mb-2.5 text-[12px] leading-snug" style={{ color: 'var(--mute)' }}>
            {t('rail.still_waiting_intro')}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {longTimers.map((p) => (
              <RailPetCard key={p.id} pet={p} />
            ))}
          </div>
        </section>
      )}

      <div
        className="mt-auto rounded-2xl p-3.5 text-[11.5px] leading-relaxed"
        style={{ background: 'var(--surfaceAlt)', color: 'var(--mute)' }}
      >
        <div
          className="mb-1.5 text-[10px] font-bold tracking-[0.08em] uppercase"
          style={{ color: 'var(--ink)' }}
        >
          {t('rail.sources_label')}
        </div>
        {t('rail.sources_body')}
      </div>
    </aside>
  )
}

function RailSectionHead({ title, meta }: { title: string; meta: string }): React.ReactElement {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h2 className="display text-[13px]" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      <span className="text-[11px]" style={{ color: 'var(--mute)' }}>
        {meta}
      </span>
    </div>
  )
}

function daysListed(pet: Pet): number {
  const ms = Date.now() - new Date(pet.firstSeenAt).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

// Compact row used by Recently arrived. 44x44 thumb + name + age + shelter + days.
function RailPetRow({ pet }: { pet: Pet }): React.ReactElement {
  const thumb = pet.photoUrls[0] ?? '/pet-placeholder.svg'
  const age = formatAge(pet.ageMonths)
  return (
    <Link
      href={`/pets/${pet.id}`}
      className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-black/[0.04]"
    >
      <span
        className="size-11 shrink-0 overflow-hidden rounded-[10px] bg-stone-100"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          className="size-full object-cover"
          style={{ objectPosition: 'center 30%' }}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className="truncate text-[17px] tracking-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
          >
            {pet.name}
          </span>
          {age && (
            <span className="shrink-0 text-[11px]" style={{ color: 'var(--mute)' }}>
              {age}
            </span>
          )}
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--mute)' }}>
          {prettySource(pet.source)} · {t('rail.days_waiting', { days: daysListed(pet) })}
        </span>
      </span>
    </Link>
  )
}

// Square card used by Still waiting. Square thumb on top, name+age+shelter+days below.
function RailPetCard({ pet }: { pet: Pet }): React.ReactElement {
  const thumb = pet.photoUrls[0] ?? '/pet-placeholder.svg'
  const age = formatAge(pet.ageMonths)
  return (
    <Link href={`/pets/${pet.id}`} className="flex flex-col gap-2 text-left">
      <span
        className="relative aspect-square overflow-hidden rounded-[14px] bg-stone-100"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: 'center 30%' }}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </span>
      <span className="block">
        <span className="flex items-baseline gap-1.5">
          <span
            className="text-[17px] tracking-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
          >
            {pet.name}
          </span>
          {age && (
            <span className="text-[11px]" style={{ color: 'var(--mute)' }}>
              {age}
            </span>
          )}
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--mute)' }}>
          {prettySource(pet.source)} · {daysListed(pet)}d
        </span>
      </span>
    </Link>
  )
}

function prettySource(src: string): string {
  return src.replace(/_/g, ' ').toUpperCase()
}
