'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { FavoriteNote } from './FavoriteNote'
import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
import { t } from '@/lib/i18n'
import { useFavorites, useFavoriteNote } from '@/lib/local-state'
import type { Pet } from '@/types/pet'

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'loaded'; pets: Pet[]; missingIds: string[] }
  | { kind: 'error'; message: string }

// Compare view supports 2–3 pets per spec. Selecting beyond the cap is
// blocked at the click handler so users get instant feedback instead of a
// quiet no-op.
const COMPARE_MIN = 2
const COMPARE_MAX = 3

export function FavoritesClient(): React.ReactElement {
  const router = useRouter()
  const favorites = useFavorites()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (favorites.ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'empty' })
      return
    }
    let cancelled = false
    Promise.all(
      favorites.ids.map(async (id) => {
        try {
          const response = await fetch(`/api/pets/${id}`, { cache: 'no-store' })
          if (!response.ok) return { id, pet: null }
          return { id, pet: (await response.json()) as Pet }
        } catch {
          return { id, pet: null }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const pets = results.map((r) => r.pet).filter((p): p is Pet => Boolean(p))
      const missingIds = results.filter((r) => !r.pet).map((r) => r.id)
      setState({ kind: 'loaded', pets, missingIds })
    })
    return () => {
      cancelled = true
    }
  }, [favorites.ids])

  // Drop any selections that no longer correspond to loaded pets — happens
  // if a favorite is removed mid-selection from another tab. The functional
  // setState short-circuits when nothing changed, so this only causes a
  // re-render in the rare cleanup case.
  useEffect(() => {
    if (state.kind !== 'loaded') return
    const validIds = new Set(state.pets.map((p) => p.id))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds((current) => {
      const filtered = current.filter((id) => validIds.has(id))
      return filtered.length === current.length ? current : filtered
    })
  }, [state])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((v) => v !== id)
      if (current.length >= COMPARE_MAX) return current
      return [...current, id]
    })
  }, [])

  const exitSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds([])
  }, [])

  const startCompare = useCallback(() => {
    if (selectedIds.length < COMPARE_MIN) return
    router.push(`/favorites/compare?ids=${selectedIds.join(',')}`)
  }, [router, selectedIds])

  if (state.kind === 'loading') {
    return <p className="text-sm text-stone-600">{t('favorites.loading')}</p>
  }

  if (state.kind === 'error') {
    return (
      <p className="text-sm text-rose-600">
        {t('favorites.load_error', { reason: state.message })}
      </p>
    )
  }

  if (state.kind === 'empty') {
    return (
      <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white p-6 text-center">
        <p className="text-sm text-stone-700">{t('favorites.empty')}</p>
      </div>
    )
  }

  const canCompare = state.pets.length >= COMPARE_MIN

  return (
    <div className="flex flex-col gap-3">
      {state.missingIds.length > 0 && (
        <p className="text-xs text-amber-700">
          {t(state.missingIds.length === 1 ? 'favorites.missing_one' : 'favorites.missing_other', {
            count: state.missingIds.length,
          })}
        </p>
      )}

      <SelectionToolbar
        active={selectionMode}
        canCompare={canCompare}
        onStart={() => setSelectionMode(true)}
        onCancel={exitSelection}
      />

      <ul className="grid grid-cols-2 gap-3" role="list">
        {state.pets.map((pet) => {
          const selected = selectedIds.includes(pet.id)
          const maxReached = !selected && selectedIds.length >= COMPARE_MAX
          return (
            <FavoriteCard
              key={pet.id}
              pet={pet}
              noteOpen={openNoteId === pet.id}
              onToggleNote={() => setOpenNoteId((id) => (id === pet.id ? null : pet.id))}
              selectionMode={selectionMode}
              selected={selected}
              maxReached={maxReached}
              onToggleSelect={() => toggleSelect(pet.id)}
            />
          )
        })}
      </ul>

      {selectionMode && (
        <CompareFooter
          count={selectedIds.length}
          onCompare={startCompare}
          onCancel={exitSelection}
        />
      )}
    </div>
  )
}

function SelectionToolbar({
  active,
  canCompare,
  onStart,
  onCancel,
}: {
  active: boolean
  canCompare: boolean
  onStart: () => void
  onCancel: () => void
}): React.ReactElement | null {
  if (!canCompare && !active) return null
  return (
    <div className="flex items-center justify-between gap-2">
      {active ? (
        <>
          <p className="text-sm text-stone-700">{t('favorites.select_prompt')}</p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            {t('favorites.cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          {t('favorites.compare_cta')}
        </button>
      )}
    </div>
  )
}

function CompareFooter({
  count,
  onCompare,
  onCancel,
}: {
  count: number
  onCompare: () => void
  onCancel: () => void
}): React.ReactElement {
  const ready = count >= COMPARE_MIN
  // The footer is sticky at the bottom of the favorites list so the CTA
  // stays reachable while scrolling a long grid.
  return (
    <div className="sticky bottom-2 z-10 mt-2 flex items-center justify-between gap-3 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
      <span aria-live="polite">
        {count === 0
          ? t('favorites.pick_n_to_m', { min: COMPARE_MIN, max: COMPARE_MAX })
          : ready
            ? t('favorites.n_selected', { count })
            : t('favorites.n_selected_pick_more', { count, remaining: COMPARE_MIN - count })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-xs font-medium text-stone-300 hover:text-white"
        >
          {t('favorites.cancel')}
        </button>
        <button
          type="button"
          onClick={onCompare}
          disabled={!ready}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('favorites.compare')}
        </button>
      </div>
    </div>
  )
}

function FavoriteCard({
  pet,
  noteOpen,
  onToggleNote,
  selectionMode,
  selected,
  maxReached,
  onToggleSelect,
}: {
  pet: Pet
  noteOpen: boolean
  onToggleNote: () => void
  selectionMode: boolean
  selected: boolean
  maxReached: boolean
  onToggleSelect: () => void
}): React.ReactElement {
  const { note } = useFavoriteNote(pet.id)
  const hasNote = note.trim().length > 0

  const cardClass = useMemo(
    () =>
      cn(
        'group flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
        selectionMode
          ? selected
            ? 'ring-2 ring-amber-500 cursor-pointer'
            : maxReached
              ? 'ring-stone-200 opacity-50 cursor-not-allowed'
              : 'ring-stone-200 cursor-pointer hover:ring-amber-400'
          : 'ring-stone-200 hover:ring-amber-400',
      ),
    [maxReached, selected, selectionMode],
  )

  const inner = (
    <>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pet.photoUrls[0] ?? '/pet-placeholder.svg'}
          alt={pet.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          // See PetGalleryCarousel: SPCA's CDN selectively 403s on
          // Referer, and some URLs are stale duplicates that 404.
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget
            if (!img.src.endsWith('/pet-placeholder.svg')) {
              img.src = '/pet-placeholder.svg'
            }
          }}
        />
        <span
          className={cn(
            'absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
            pet.status === 'available'
              ? 'bg-emerald-100/90 text-emerald-800'
              : pet.status === 'pending'
                ? 'bg-amber-100/90 text-amber-900'
                : 'bg-stone-200/90 text-stone-700',
          )}
        >
          {pet.status}
        </span>
        {selectionMode && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold',
              selected
                ? 'border-amber-500 bg-amber-500 text-white'
                : 'border-white bg-white/80 text-stone-400',
            )}
          >
            {selected ? '✓' : ''}
          </span>
        )}
      </div>
      <div className="px-1 pb-1">
        <p className="text-sm font-semibold text-stone-900">{pet.name}</p>
        <p className="text-xs text-stone-600">
          {[titleCase(pet.species), pet.breed, formatAge(pet.ageMonths)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </>
  )

  return (
    <li className="flex flex-col gap-2">
      {selectionMode ? (
        <button
          type="button"
          onClick={onToggleSelect}
          disabled={maxReached}
          aria-pressed={selected}
          aria-label={t(
            selected ? 'favorites.select_aria_uncheck' : 'favorites.select_aria_check',
            {
              name: pet.name,
            },
          )}
          className={cardClass}
        >
          {inner}
        </button>
      ) : (
        <Link href={`/pets/${pet.id}`} className={cardClass}>
          {inner}
        </Link>
      )}

      {!selectionMode && (
        <>
          <button
            type="button"
            onClick={onToggleNote}
            aria-expanded={noteOpen}
            className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-xs text-stone-700 transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <span className={cn('truncate', !hasNote && 'text-stone-500')}>
              {hasNote ? note : t('favorites.note_add')}
            </span>
            <span aria-hidden="true" className="shrink-0 text-stone-400">
              {noteOpen ? '−' : '+'}
            </span>
          </button>

          {noteOpen && <FavoriteNote petId={pet.id} petName={pet.name} requireFavorited={false} />}
        </>
      )}
    </li>
  )
}
