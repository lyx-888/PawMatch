'use client'

import { useMemo } from 'react'

import { petToMatchPet, profileDraftToMatchProfile } from './adapters'
import { score } from './score'
import type { MatchScore } from './types'
import { useProfileDraft } from '@/lib/onboarding/profile-draft'
import type { Pet } from '@/types/pet'

/**
 * Client-side match score for the current anonymous user.
 *
 * Phase 2.7.1: subscribes to the localStorage profile draft and re-runs
 * the pure `score()` function on every change. Identical algorithm to
 * the future server-side computation, calibrated by the same
 * tests/matching-fixtures.json file. When the user creates an account
 * (Phase 3), server-computed scores take over and this hook stops being
 * called.
 */
export function useMatchScore(pet: Pet | null | undefined): MatchScore | null {
  const draft = useProfileDraft()
  return useMemo(() => {
    if (!pet) return null
    const matchProfile = profileDraftToMatchProfile(draft)
    const matchPet = petToMatchPet(pet)
    return score(matchProfile, matchPet)
  }, [pet, draft])
}
