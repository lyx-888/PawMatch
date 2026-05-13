'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { useFavorites } from '@/lib/local-state'

// Desktop-only left rail (280px). Hidden at <1024px — BottomNav takes over
// there. Renders brand wordmark, primary nav, and a "Your home" footer
// card. Filter chips from the prototype are NOT included yet because they
// only make sense on the home/browse surface — porting that is a Phase E
// follow-up once the swipe screen has filter state plumbed through.

type Item = {
  href: string
  labelKey: string
  iconKey: keyof typeof NavIcon
  badgeOverride?: number
}

const ITEMS: Item[] = [
  { href: '/', labelKey: 'nav.browse', iconKey: 'paw' },
  { href: '/search', labelKey: 'nav.search', iconKey: 'search' },
  { href: '/watches', labelKey: 'nav.watches', iconKey: 'bell' },
  { href: '/favorites', labelKey: 'nav.saved', iconKey: 'heart' },
  { href: '/profile', labelKey: 'nav.profile', iconKey: 'user' },
]

export function SideNav(): React.ReactElement {
  const pathname = usePathname()
  const { count: savedCount } = useFavorites()

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className="nav-side"
      aria-label={t('nav.primary_label')}
      style={{
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(8px)',
        borderRight: '1px solid var(--muteLine)',
      }}
    >
      <Link
        href="/"
        className="display mb-5 inline-flex items-center gap-2.5 px-2"
        style={{ fontSize: 19, color: 'var(--ink)', letterSpacing: '-0.025em' }}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-[9px] text-white"
          style={{ background: 'var(--ink)' }}
        >
          <NavIcon.paw size={18} />
        </span>
        {t('app.brand')}{' '}
        <span style={{ color: 'var(--mute)', fontWeight: 400 }}>{t('app.brand_suffix')}</span>
      </Link>

      <nav className="mb-6 flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const active = isActive(item.href)
          const Icon = NavIcon[item.iconKey]
          const badge = item.href === '/favorites' ? savedCount : item.badgeOverride
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                active ? 'text-white' : 'hover:bg-black/[0.04]',
              )}
              style={{
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? '#fff' : 'var(--ink)',
              }}
            >
              <Icon size={17} />
              <span className="flex-1">{t(item.labelKey)}</span>
              {badge != null && badge > 0 && (
                <span
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                  style={{
                    background: active ? 'rgba(255,255,255,0.18)' : 'var(--primary)',
                    color: '#fff',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div
        className="mt-auto rounded-xl p-3 text-[11.5px] leading-relaxed"
        style={{ background: 'var(--surfaceAlt)', color: 'var(--ink)' }}
      >
        <div className="mb-0.5 font-bold">{t('side_nav.your_home')}</div>
        <div style={{ color: 'var(--mute)' }}>{t('side_nav.your_home_hint')}</div>
        <Link
          href="/profile"
          className="mt-1.5 inline-block text-[11.5px] font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          {t('side_nav.edit')}
        </Link>
      </div>
    </aside>
  )
}

const NavIcon = {
  paw: ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="9" r="2" />
      <circle cx="10" cy="6" r="2" />
      <circle cx="14" cy="6" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M12 12c-3 0-6 2-6 5 0 2 1.5 3 3 3 1 0 1.5-.5 3-.5s2 .5 3 .5c1.5 0 3-1 3-3 0-3-3-5-6-5z" />
    </svg>
  ),
  search: ({ size }: { size: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  bell: ({ size }: { size: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 16v-5a6 6 0 1 0-12 0v5L4 19h16z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  heart: ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.1C1 8.9 2.7 5.7 5.7 5.2c2-.3 3.9.7 4.8 2.4l1.5 2.4 1.5-2.4c.9-1.7 2.8-2.7 4.8-2.4 3 .5 4.7 3.7 3.3 6.7C19.5 16.4 12 21 12 21z" />
    </svg>
  ),
  user: ({ size }: { size: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
} as const
