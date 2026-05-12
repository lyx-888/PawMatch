'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'

import { useReadinessSnippet } from '@/lib/readiness/state'
import type { SnippetContext } from '@/lib/readiness/snippets'

type Props = {
  context: SnippetContext
  className?: string
}

// Inline expandable card with the next eligible adoption-readiness snippet
// for the given context. Renders null when nothing is eligible. Dismissing
// or expanding marks the snippet as seen so it won't re-appear — this is
// the "viewed snippets tracked in user state" requirement.
export function ReadinessSnippet({ context, className }: Props): React.ReactElement | null {
  const { snippet, dismiss } = useReadinessSnippet(context)
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()

  // Auto-mark as seen once the user has had it on screen long enough that
  // the spec's "never repeat" rule kicks in. 2s is short enough that a
  // mis-scroll past the card still counts, long enough to filter out
  // momentary flashes during route transitions.
  useEffect(() => {
    if (!snippet) return
    const handle = window.setTimeout(() => dismiss(), 2000)
    return () => window.clearTimeout(handle)
  }, [dismiss, snippet])

  if (!snippet) return null

  return (
    <section
      aria-labelledby={titleId}
      className={[
        'flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-stone-800',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium tracking-wide text-amber-700 uppercase">
            Good to know
          </p>
          <h3 id={titleId} className="text-sm font-semibold text-stone-900">
            {snippet.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mt-1 -mr-1 rounded-full p-1 text-stone-400 hover:bg-amber-100 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <p className="text-sm leading-snug">{snippet.summary}</p>

      {expanded && (
        <ul className="ml-4 list-disc space-y-1 text-sm text-stone-700">
          {snippet.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-xs font-medium text-amber-800 hover:text-amber-900"
        >
          {expanded ? 'Show less' : 'Show details'}
        </button>
        <Link
          href={`/learn/${snippet.learnSlug}`}
          className="text-xs font-medium text-amber-800 hover:text-amber-900"
        >
          More on this →
        </Link>
      </div>
    </section>
  )
}
