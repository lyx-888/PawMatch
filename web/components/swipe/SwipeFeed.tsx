'use client'

import { useCallback, useEffect, useState } from 'react'

import { SwipeStack } from './SwipeStack'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { ProgressiveQuestionCard } from '@/components/onboarding/ProgressiveQuestionCard'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { getExcludeIds, useFavorites } from '@/lib/local-state'
import { useShouldShowOnboardingOnFirstVisit } from '@/lib/onboarding/state'
import type { Pet } from '@/types/pet'

const PAGE_SIZE = 30
const SWIPE_FIVE_COMPLETE = 5

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
  const shouldShowOnboarding = useShouldShowOnboardingOnFirstVisit() && !onboardingClosed
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

  // Upfront quiz takes the whole swipe-stack area. The form is the user's
  // first interaction so it must visually own the surface — rendering the
  // SwipeStack alongside (or behind) it would invite stray swipes before the
  // user has even read the prompt.
  if (shouldShowOnboarding) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-stretch justify-center">
        <OnboardingFlow open={true} onClose={() => setOnboardingClosed(true)} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-0 flex-1 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900">
        {t('swipe.load_error', { reason: error })}
      </div>
    )
  }

  if (pets === null) {
    return <SkeletonCard />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ProgressiveQuestionCard context={{ favoritesCount }} />
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
          if (nextCount === SWIPE_FIVE_COMPLETE && !fiveCompleteFired) {
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
      className="min-h-0 w-full flex-1 animate-pulse rounded-3xl bg-stone-100"
      aria-hidden="true"
    />
  )
}
