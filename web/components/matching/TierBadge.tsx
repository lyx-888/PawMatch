import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import type { Tier } from '@/lib/matching/types'

type Props = {
  tier: Tier
  className?: string
}

// Tier palette ported from the claudedesign prototype. Frosted-white badge
// with a coloured dot, label colour matches the tier so a scanning user
// can pick a tier out at a glance without bold backgrounds. Used on the
// pet detail page, favorites list, and compare view — the SwipeCard has
// its own inline version that lives over the dark photo overlay.
const TIER_FG: Record<Tier, string> = {
  great: 'var(--sage)',
  good: 'var(--ink)',
  stretch: 'var(--amber-tone)',
  hard_fail: 'var(--danger)',
}

export function TierBadge({ tier, className }: Props): React.ReactElement {
  const label = t(`match.tier.${tier}`)
  const fg = TIER_FG[tier]
  return (
    <span
      role="status"
      aria-label={t('match.tier_aria', { tier: label })}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        className,
      )}
      style={{
        background: 'rgba(255,255,255,0.94)',
        color: fg,
        boxShadow: 'inset 0 0 0 1px var(--muteLine)',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full"
        style={{ background: fg }}
      />
      {label}
    </span>
  )
}
