'use client'

import { useState } from 'react'

import { ReasonList } from './ReasonList'
import { cn } from '@/lib/cn'
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
        className="text-amber-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
      >
        {open ? 'Hide match breakdown' : 'Why am I seeing this?'}
      </button>
      {open && (
        <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs text-stone-500">Match score: {match.score} / 100</p>
          <ReasonList reasons={match.reasons} limit={Infinity} className="mt-2 text-sm" />
        </div>
      )}
    </div>
  )
}
