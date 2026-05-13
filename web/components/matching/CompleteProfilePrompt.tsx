import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

type Props = {
  className?: string
}

// Shown on a pet card when the user hasn't answered any essentials yet
// (so the tier badge is a stretch-by-default rather than a real score).
// Avoid showing this on every card — the onboarding prompt covers that —
// but it's useful on the detail page so a user landing from a deeplink
// understands why no real score is displayed.
export function CompleteProfilePrompt({ className }: Props): React.ReactElement {
  return (
    <p
      className={cn('rounded-2xl px-3 py-2 text-xs', className)}
      style={{
        background: 'var(--amber-soft)',
        color: 'var(--amber-tone)',
        boxShadow: 'inset 0 0 0 1px var(--amber-tone)',
      }}
    >
      {t('match.complete_profile_prompt')}
    </p>
  )
}
