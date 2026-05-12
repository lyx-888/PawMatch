'use client'

import { useEffect, useState } from 'react'

import { ReadinessSnippet } from './ReadinessSnippet'
import { useFavorites } from '@/lib/local-state'
import { isLongTimer } from '@/lib/readiness/snippets'
import type { Pet } from '@/types/pet'

// Favorites-page wrapper. Two of the six snippets fire here:
//   - third_favorite_added: any 3+ saved pets.
//   - first_long_timer_favorited: at least one saved pet is a long-timer
//     (≥ 90 days listed, ≥ 7 years old, or special-needs).
//
// We need the pet rows to check long-timer-ness. To avoid double-fetching
// the same data that FavoritesClient already pulls, we keep our own cache
// keyed off the favorites id list and bail out if anything 404s.
export function FavoritesReadinessSnippet(): React.ReactElement | null {
  const { ids, count } = useFavorites()
  const [hasLongTimer, setHasLongTimer] = useState(false)

  useEffect(() => {
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasLongTimer(false)
      return
    }
    let cancelled = false
    Promise.all(
      ids.map(async (id) => {
        try {
          const response = await fetch(`/api/pets/${id}`, { cache: 'no-store' })
          if (!response.ok) return null
          return (await response.json()) as Pet
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const pets = results.filter((p): p is Pet => Boolean(p))
      setHasLongTimer(pets.some((p) => isLongTimer(p)))
    })
    return () => {
      cancelled = true
    }
  }, [ids])

  // Only render once the user has at least one saved pet — earlier than
  // that and neither trigger has any chance of firing.
  if (count === 0) return null
  return (
    <ReadinessSnippet context={{ favoritesCount: count, hasLongTimerFavorite: hasLongTimer }} />
  )
}
