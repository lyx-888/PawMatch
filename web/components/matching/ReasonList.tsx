import { cn } from '@/lib/cn'
import type { Reason } from '@/lib/matching/types'

type Props = {
  reasons: Reason[]
  // Default 2 per requirements §2.3.5 ("Two reasons displayed on the swipe
  // card"). The detail page passes Infinity to show the full list.
  limit?: number
  className?: string
}

// Token-driven colours (prototype palette). Positive reasons in sage, notes
// in ink, risks in danger. Icons stay the same compact glyphs the layout
// already depends on for alignment.
const KIND_STYLE: Record<Reason['kind'], React.CSSProperties> = {
  positive: { color: 'var(--sage)' },
  note: { color: 'var(--ink)' },
  risk: { color: 'var(--danger)' },
}

const KIND_ICON: Record<Reason['kind'], string> = {
  positive: '✓',
  note: '·',
  risk: '!',
}

/**
 * Render up to `limit` reasons. Picks "one positive, one note/risk if
 * applicable" per §2.3.5: takes the first positive, then the first
 * note/risk that isn't already in. For the detail-page full breakdown,
 * pass `limit=Infinity`.
 */
export function ReasonList({ reasons, limit = 2, className }: Props): React.ReactElement | null {
  if (reasons.length === 0) return null
  const picked = pickReasons(reasons, limit)
  if (picked.length === 0) return null
  return (
    <ul className={cn('flex flex-col gap-1 text-xs', className)}>
      {picked.map((reason, i) => (
        <li
          key={`${reason.template}-${i}`}
          className="flex gap-1.5"
          style={KIND_STYLE[reason.kind]}
        >
          <span aria-hidden="true" className="select-none">
            {KIND_ICON[reason.kind]}
          </span>
          <span>{reason.message}</span>
        </li>
      ))}
    </ul>
  )
}

function pickReasons(reasons: Reason[], limit: number): Reason[] {
  if (limit === Infinity || reasons.length <= limit) return reasons
  // Prefer one positive + one note/risk so the card always shows both
  // sides when both exist. Order within each kind is preserved from the
  // engine's emission order (hard-fails first).
  const positive = reasons.find((r) => r.kind === 'positive')
  const negative = reasons.find((r) => r.kind === 'risk' || r.kind === 'note')
  const picked = [positive, negative].filter((r): r is Reason => r != null)
  if (picked.length < limit) {
    // Pad with whatever's left in original order, deduped.
    for (const r of reasons) {
      if (picked.length >= limit) break
      if (!picked.includes(r)) picked.push(r)
    }
  }
  return picked.slice(0, limit)
}
