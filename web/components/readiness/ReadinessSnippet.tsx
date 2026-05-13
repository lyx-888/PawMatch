'use client'

import Link from 'next/link'
import { useEffect, useId, useState } from 'react'

import { t } from '@/lib/i18n'
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

  // Mark seen on unmount so the snippet doesn't visibly yank itself out of
  // view while the user is still reading. The previous 2-second timer caused
  // a flash: marking seen triggers a re-render, the hook returns null, and
  // the card disappears mid-read. Unmount fires when the user navigates away
  // (closes the sheet, switches pets), at which point "they had a chance to
  // see it" is true and the never-repeat rule kicks in.
  useEffect(() => {
    if (!snippet) return
    return () => dismiss()
  }, [dismiss, snippet])

  if (!snippet) return null

  return (
    <section
      aria-labelledby={titleId}
      className={['flex flex-col gap-2 rounded-2xl p-3', className ?? ''].filter(Boolean).join(' ')}
      style={{
        background: 'var(--amber-soft)',
        boxShadow: 'inset 0 0 0 1px var(--amber-tone)',
        color: 'var(--ink)',
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p
            className="text-[10px] font-bold tracking-[0.08em] uppercase"
            style={{ color: 'var(--amber-tone)' }}
          >
            {t('readiness.kicker')}
          </p>
          <h3 id={titleId} className="display text-sm" style={{ color: 'var(--ink)' }}>
            {snippet.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('readiness.dismiss_aria')}
          className="-mt-1 -mr-1 rounded-full p-1 focus:outline-none"
          style={{ color: 'var(--mute)' }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <p className="text-sm leading-snug">{snippet.summary}</p>

      {expanded && (
        <ul className="ml-4 list-disc space-y-1 text-sm" style={{ color: 'var(--ink)' }}>
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
          className="text-xs font-medium"
          style={{ color: 'var(--amber-tone)' }}
        >
          {expanded ? t('readiness.show_less') : t('readiness.show_details')}
        </button>
        <Link
          href={`/learn/${snippet.learnSlug}`}
          className="text-xs font-medium"
          style={{ color: 'var(--amber-tone)' }}
        >
          {t('readiness.more_on_this')}
        </Link>
      </div>
    </section>
  )
}
