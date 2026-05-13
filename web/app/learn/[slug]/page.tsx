import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppHeader } from '@/components/layout/AppHeader'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import { t } from '@/lib/i18n'
import { SNIPPETS } from '@/lib/readiness/snippets'

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

// Phase 2.10 placeholder per requirements §2.9 — the snippet's summary +
// bullets, surfaced as a full page so the "More on this" link has something
// to point at. Phase 5 replaces this with curated long-form content.
export default async function LearnGuidePage({ params }: Props): Promise<React.ReactElement> {
  const { slug } = await params
  const snippet = SNIPPETS.find((s) => s.learnSlug === slug)
  if (!snippet) notFound()

  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <Link href="/learn" className="text-sm" style={{ color: 'var(--primary)' }}>
          {t('learn.back')}
        </Link>
        <h1 className="display text-2xl" style={{ color: 'var(--ink)' }}>
          {snippet.title}
        </h1>
        <p className="text-base" style={{ color: 'var(--ink)' }}>
          {snippet.summary}
        </p>
        <ul className="ml-5 list-disc space-y-2 text-sm" style={{ color: 'var(--ink)' }}>
          {snippet.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p
          className="mt-4 rounded-xl p-3 text-xs"
          style={{ background: 'var(--surfaceAlt)', color: 'var(--mute)' }}
        >
          {t('learn.placeholder')}
        </p>
      </main>
    </div>
  )
}
