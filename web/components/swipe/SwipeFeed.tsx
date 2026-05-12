'use client'

import { useCallback, useEffect, useState } from 'react'

import { SwipeStack } from './SwipeStack'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { ProgressiveQuestionCard } from '@/components/onboarding/ProgressiveQuestionCard'
import { track } from '@/lib/analytics'
import { getExcludeIds, useFavorites } from '@/lib/local-state'
import { useShouldShowOnboardingPrompt } from '@/lib/onboarding/state'
import type { Pet } from '@/types/pet'

const PAGE_SIZE = 30

export function SwipeFeed(): React.ReactElement {
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [swipesThisSession, setSwipesThisSession] = useState(0)
  const [fiveCompleteFired, setFiveCompleteFired] = useState(false)
  // Onboarding is dismissable from within the flow — once the user closes
  // it we don't want to immediately re-show it from the prompt hook (the
  // hook reads localStorage which the form updates async). Local override
  // keeps the close instantaneous.
  const [onboardingClosed, setOnboardingClosed] = useState(false)
  const shouldShowOnboarding = useShouldShowOnboardingPrompt(swipesThisSession) && !onboardingClosed
  // Progressive triggers on the swipe feed look at the favorites count
  // (first / third favorite). Pet-detail-specific triggers like the cat
  // mesh question live on the pet detail page where the species context is.
  const { count: favoritesCount } = useFavorites()

  const load = useCallback(async () => {
    try {
      const excludeIds = getExcludeIds()
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','))
      const response = await fetch(`/api/pets?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { pets: Pet[] }
      setPets(data.pets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load')
    }
  }, [])

  useEffect(() => {
    track('swipe_session_started')
    // One-shot async kickoff on mount; setState happens inside load() but only
    // after the network round-trip, so no cascading-render risk.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900">
        Couldn&apos;t load pets ({error}). Check your connection and reload.
      </div>
    )
  }

  if (pets === null) {
    return <SkeletonCard />
  }

  return (
    <div className="flex flex-col gap-4">
      <OnboardingFlow open={shouldShowOnboarding} onClose={() => setOnboardingClosed(true)} />
      {/* Hide while the onboarding prompt is occupying the same slot —
          stacking two amber cards would be visual noise and only the
          first-favorite trigger would be eligible anyway. */}
      {!shouldShowOnboarding && <ProgressiveQuestionCard context={{ favoritesCount }} />}
      <SwipeStack
        pets={pets}
        onDecision={(decision, pet) => {
          track(decision === 'favorite' ? 'pet_favorited' : 'pet_passed', {
            pet_id: pet.id,
            source: pet.source,
          })
          track('pet_viewed', { pet_id: pet.id, source: pet.source })
          const nextCount = swipesThisSession + 1
          setSwipesThisSession(nextCount)
          if (nextCount === 5 && !fiveCompleteFired) {
            track('swipe_5_complete')
            setFiveCompleteFired(true)
          }
        }}
        onEmpty={() => {
          // Re-fetch in case the user has swiped through every loaded pet.
          load()
        }}
      />
    </div>
  )
}

function SkeletonCard(): React.ReactElement {
  return (
    <div
      className="aspect-[3/4] w-full animate-pulse rounded-3xl bg-stone-100"
      aria-hidden="true"
    />
  )
}
