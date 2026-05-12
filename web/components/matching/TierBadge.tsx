import { cn } from '@/lib/cn'
import type { Tier } from '@/lib/matching/types'

type Props = {
  tier: Tier
  className?: string
}

const TIER_LABEL: Record<Tier, string> = {
  great: 'Great match',
  good: 'Good match',
  stretch: 'Stretch',
  hard_fail: 'Not eligible',
}

// Colour scale per requirements §2.3 — distinct enough that a user
// scanning the swipe stack can tell them apart at a glance.
const TIER_CLASS: Record<Tier, string> = {
  great: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  good: 'bg-amber-100 text-amber-900 border-amber-300',
  stretch: 'bg-stone-100 text-stone-700 border-stone-300',
  hard_fail: 'bg-rose-100 text-rose-900 border-rose-300',
}

export function TierBadge({ tier, className }: Props): React.ReactElement {
  return (
    <span
      role="status"
      aria-label={`Match tier: ${TIER_LABEL[tier]}`}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TIER_CLASS[tier],
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}
