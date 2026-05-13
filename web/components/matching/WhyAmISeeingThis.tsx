'use client'

import { useState } from 'react'

import { ReasonList } from './ReasonList'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import type { MatchScore } from '@/lib/matching/types'

type Props = {
  match: MatchScore
  className?: string
}

// The "Why am I seeing this?" expandable per requirements §2.7. Renders
// the full reason list inline (not a modal) so the user can scroll back
// to the photo without losing context.
export function WhyAmISeeingThis({ match, className }: Props): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('text-sm', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]"
        style={{ color: 'var(--primary)' }}
      >
        {open ? t('match.why_hide') : t('match.why_show')}
      </button>
      {open && (
        <div
          className="mt-2 rounded-2xl p-3"
          style={{
            background: 'var(--surfaceAlt)',
            boxShadow: 'inset 0 0 0 1px var(--muteLine)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--mute)' }}>
            {t('match.score', { score: match.score })}
          </p>
          <ReasonList reasons={match.reasons} limit={Infinity} className="mt-2 text-sm" />
        </div>
      )}
    </div>
  )
}
