'use client'

import { CompleteProfilePrompt } from './CompleteProfilePrompt'
import { TierBadge } from './TierBadge'
import { WhyAmISeeingThis } from './WhyAmISeeingThis'
import { t } from '@/lib/i18n'
import { useMatchScore } from '@/lib/matching/use-score'
import { hasAllEssentials, useProfileDraft } from '@/lib/onboarding/profile-draft'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
}

// Match section for the pet detail page. Renders the tier badge, the
// expandable "Why am I seeing this?" breakdown, and the
// complete-profile prompt when essentials are missing. Lives in its own
// client component so the surrounding detail page can stay server-rendered.
export function PetMatchSection({ pet }: Props): React.ReactElement | null {
  const draft = useProfileDraft()
  const match = useMatchScore(pet)
  if (!match) return null
  const essentialsMissing = !hasAllEssentials(draft)

  return (
    <section aria-labelledby="match-section" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="match-section" className="text-lg font-semibold text-stone-900">
          {t('match.section_title')}
        </h2>
        <TierBadge tier={match.tier} />
      </div>
      {essentialsMissing && <CompleteProfilePrompt />}
      <WhyAmISeeingThis match={match} />
    </section>
  )
}
