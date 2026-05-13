import type { Metadata } from 'next'

import { t } from '@/lib/i18n'

// Stub route. The Watches feature (saved-search alerts when matching pets
// arrive at a shelter) is a Phase 3 build; for now this just keeps the
// SideNav/BottomNav links from 404-ing.

export const metadata: Metadata = {
  title: t('watches.title'),
}

export default function WatchesPage(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="display mb-2 text-2xl" style={{ color: 'var(--ink)' }}>
        {t('watches.title')}
      </h1>
      <p className="text-sm" style={{ color: 'var(--mute)' }}>
        {t('watches.placeholder')}
      </p>
    </main>
  )
}
