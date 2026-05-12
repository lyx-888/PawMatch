'use client'

import { useState } from 'react'

import { OnboardingForm } from './OnboardingForm'
import { OnboardingPrompt } from './OnboardingPrompt'
import { track } from '@/lib/analytics'
import { markOnboardingCompleted, markOnboardingDismissed } from '@/lib/onboarding/state'
import { hasAllEssentials, type ProfileDraft } from '@/lib/onboarding/profile-draft'

type Props = {
  // Renders nothing until the parent flips this to true. Keeps the trigger
  // logic in SwipeFeed (where the swipe counter lives) and the rendering
  // logic here.
  open: boolean
  onClose: () => void
}

// Stage machine for the onboarding card:
//   * `prompt`  — the soft "Want smarter matches?" banner.
//   * `form`    — the three-question card after the user taps Get started.
// `open=false` always wins so the parent can dismiss us instantly.
export function OnboardingFlow({ open, onClose }: Props): React.ReactElement | null {
  const [stage, setStage] = useState<'prompt' | 'form'>('prompt')

  if (!open) return null

  if (stage === 'form') {
    return (
      <OnboardingForm
        onComplete={(draft: ProfileDraft) => {
          if (hasAllEssentials(draft)) {
            markOnboardingCompleted()
            track('onboarding_completed')
            onClose()
          } else {
            // Acts like "save & continue" — keep what's been entered but
            // don't claim completion. The next session can resume.
            onClose()
          }
        }}
        onClose={() => {
          // Closing mid-form is treated as a soft pause, not a dismissal:
          // the user can still be re-prompted later. We surface the action
          // as analytics so we can see drop-off in §5.11 dashboards.
          track('onboarding_form_closed')
          onClose()
        }}
      />
    )
  }

  return (
    <OnboardingPrompt
      onStart={() => {
        track('onboarding_started')
        setStage('form')
      }}
      onDismiss={() => {
        markOnboardingDismissed()
        track('onboarding_dismissed')
        onClose()
      }}
    />
  )
}
