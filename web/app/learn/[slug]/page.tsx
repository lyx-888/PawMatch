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
    <div className="flex min-h-full flex-col bg-stone-50">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <Link href="/learn" className="text-sm text-amber-700 hover:text-amber-800">
          {t('learn.back')}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{snippet.title}</h1>
        <p className="text-base text-stone-700">{snippet.summary}</p>
        <ul className="ml-5 list-disc space-y-2 text-sm text-stone-800">
          {snippet.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-stone-100 p-3 text-xs text-stone-600">
          {t('learn.placeholder')}
        </p>
      </main>
    </div>
  )
}
