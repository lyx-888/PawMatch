import type { Metadata } from 'next'

import { t } from '@/lib/i18n'

// Stub route. Wired into the nav so SideNav/BottomNav don't 404, but no
// real Profile UI yet — the onboarding flow is the closest equivalent
// today. Replace once a real profile screen is designed.

export const metadata: Metadata = {
  title: t('profile.title'),
}

export default function ProfilePage(): React.ReactElement {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="display mb-2 text-2xl" style={{ color: 'var(--ink)' }}>
        {t('profile.title')}
      </h1>
      <p className="text-sm" style={{ color: 'var(--mute)' }}>
        {t('profile.placeholder')}
      </p>
    </main>
  )
}
