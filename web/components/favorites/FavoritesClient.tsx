'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { FavoriteNote } from './FavoriteNote'
import { cn } from '@/lib/cn'
import { formatAge, titleCase } from '@/lib/format'
import { useFavorites, useFavoriteNote } from '@/lib/local-state'
import type { Pet } from '@/types/pet'

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'loaded'; pets: Pet[]; missingIds: string[] }
  | { kind: 'error'; message: string }

export function FavoritesClient(): React.ReactElement {
  const favorites = useFavorites()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)

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

  if (state.kind === 'loading') {
    return <p className="text-sm text-stone-600">Loading favorites…</p>
  }

  if (state.kind === 'error') {
    return <p className="text-sm text-rose-600">Couldn&apos;t load favorites: {state.message}</p>
  }

  if (state.kind === 'empty') {
    return (
      <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white p-6 text-center">
        <p className="text-sm text-stone-700">
          No favorites yet. Swipe right on the home page, or tap save on a pet&apos;s page.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {state.missingIds.length > 0 && (
        <p className="text-xs text-amber-700">
          {state.missingIds.length} favorite{state.missingIds.length === 1 ? '' : 's'} couldn&apos;t
          be loaded — probably adopted or removed from the shelter. They&apos;ll vanish from this
          list next visit.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3" role="list">
        {state.pets.map((pet) => (
          <FavoriteCard
            key={pet.id}
            pet={pet}
            noteOpen={openNoteId === pet.id}
            onToggleNote={() => setOpenNoteId((id) => (id === pet.id ? null : pet.id))}
          />
        ))}
      </ul>
    </div>
  )
}

function FavoriteCard({
  pet,
  noteOpen,
  onToggleNote,
}: {
  pet: Pet
  noteOpen: boolean
  onToggleNote: () => void
}): React.ReactElement {
  const { note } = useFavoriteNote(pet.id)
  const hasNote = note.trim().length > 0

  return (
    <li className="flex flex-col gap-2">
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
        </div>
        <div className="px-1 pb-1">
          <p className="text-sm font-semibold text-stone-900">{pet.name}</p>
          <p className="text-xs text-stone-600">
            {[titleCase(pet.species), pet.breed, formatAge(pet.ageMonths)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={onToggleNote}
        aria-expanded={noteOpen}
        className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-xs text-stone-700 transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <span className={cn('truncate', !hasNote && 'text-stone-500')}>
          {hasNote ? note : 'Add a note'}
        </span>
        <span aria-hidden="true" className="shrink-0 text-stone-400">
          {noteOpen ? '−' : '+'}
        </span>
      </button>

      {noteOpen && <FavoriteNote petId={pet.id} petName={pet.name} requireFavorited={false} />}
    </li>
  )
}
