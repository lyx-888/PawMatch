'use client'

import { ReadinessSnippet } from './ReadinessSnippet'
import { useMatchScore } from '@/lib/matching/use-score'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
}

// Pet-detail-page wrapper: combines the pet on screen with the match tier
// (computed client-side from the anon profile draft) and asks the readiness
// engine for the next eligible snippet. The standalone <ReadinessSnippet/>
// would work directly, but extracting this keeps the detail page's wiring
// readable.
export function PetReadinessSnippet({ pet }: Props): React.ReactElement | null {
  const match = useMatchScore(pet)
  return <ReadinessSnippet context={{ pet, tier: match?.tier }} />
}
