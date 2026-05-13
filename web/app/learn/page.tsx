import Link from 'next/link'

import { AppHeader } from '@/components/layout/AppHeader'
import { getSourceSummaries, summarizeForHeader } from '@/lib/db/pets'
import { t } from '@/lib/i18n'
import { SNIPPETS } from '@/lib/readiness/snippets'

export const dynamic = 'force-dynamic'

// Phase 2.10 placeholder. Phase 5 expands each entry into a full guide
// (`/learn/<slug>`). The list is generated from the snippet content map so
// new snippets show up here automatically.
export default async function LearnPage(): Promise<React.ReactElement> {
  const sources = await getSourceSummaries()
  const header = summarizeForHeader(sources)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader {...header} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <h1 className="display text-2xl" style={{ color: 'var(--ink)' }}>
          {t('learn.title')}
        </h1>
        <p className="text-sm" style={{ color: 'var(--mute)' }}>
          {t('learn.intro')}
        </p>
        <ul className="flex flex-col gap-2" role="list">
          {SNIPPETS.map((snippet) => (
            <li key={snippet.id}>
              <Link
                href={`/learn/${snippet.learnSlug}`}
                className="flex flex-col gap-1 rounded-2xl p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
                style={{
                  background: 'var(--surface)',
                  boxShadow: 'inset 0 0 0 1px var(--muteLine), 0 1px 2px rgba(30,24,16,0.04)',
                }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {snippet.title}
                </p>
                <p className="text-xs" style={{ color: 'var(--mute)' }}>
                  {snippet.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
