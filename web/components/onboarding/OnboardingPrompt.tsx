'use client'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

type Props = {
  onStart: () => void
  onDismiss: () => void
  className?: string
}

// The soft inline prompt per requirements §2.2. Renders as a card the
// SwipeFeed places above the active swipe card — never blocks the swipe
// itself, and "Not now" is one tap away. The copy and the < 60-second
// promise are quoted directly from the spec.
export function OnboardingPrompt({ onStart, onDismiss, className }: Props): React.ReactElement {
  return (
    <div
      role="region"
      aria-labelledby="onboarding-prompt-heading"
      className={cn(
        'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-stone-900 shadow-sm',
        className,
      )}
    >
      <h2 id="onboarding-prompt-heading" className="text-sm font-semibold">
        {t('onboarding.prompt_heading')}
      </h2>
      <p className="mt-1 text-sm text-stone-700">{t('onboarding.prompt_body')}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          {t('onboarding.prompt_start')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
        >
          {t('onboarding.prompt_dismiss')}
        </button>
      </div>
    </div>
  )
}
