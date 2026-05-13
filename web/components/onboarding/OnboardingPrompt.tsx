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
      className={cn('rounded-2xl p-4', className)}
      style={{
        background: 'var(--primarySoft)',
        boxShadow: 'inset 0 0 0 1px var(--primary)',
        color: 'var(--ink)',
      }}
    >
      <h2
        id="onboarding-prompt-heading"
        className="display text-sm"
        style={{ color: 'var(--ink)' }}
      >
        {t('onboarding.prompt_heading')}
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>
        {t('onboarding.prompt_body')}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full px-4 py-1.5 text-sm font-semibold transition"
          style={{
            background: 'var(--primary)',
            color: '#fff',
            boxShadow: '0 6px 14px rgba(181,101,74,0.30)',
          }}
        >
          {t('onboarding.prompt_start')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3 py-1.5 text-sm font-medium transition"
          style={{ color: 'var(--mute)' }}
        >
          {t('onboarding.prompt_dismiss')}
        </button>
      </div>
    </div>
  )
}
