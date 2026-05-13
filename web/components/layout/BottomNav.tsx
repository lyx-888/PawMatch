'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { useFavorites } from '@/lib/local-state'

// Mobile-only bottom nav (<1024px). Hidden on desktop where SideNav takes
// over. Same 5 destinations as the side rail, icon + small label per tab,
// with a clay primary dot badge on the Saved tab when the user has any
// favorites stashed.

type Item = {
  href: string
  labelKey: string
  iconKey: keyof typeof Icon
}

const ITEMS: Item[] = [
  { href: '/', labelKey: 'nav.browse', iconKey: 'paw' },
  { href: '/search', labelKey: 'nav.search', iconKey: 'search' },
  { href: '/watches', labelKey: 'nav.watches', iconKey: 'bell' },
  { href: '/favorites', labelKey: 'nav.saved', iconKey: 'heart' },
  { href: '/profile', labelKey: 'nav.profile', iconKey: 'user' },
]

export function BottomNav(): React.ReactElement {
  const pathname = usePathname()
  const { count: savedCount } = useFavorites()

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      className="nav-bottom"
      aria-label={t('nav.primary_label')}
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px) saturate(160%)',
        borderTop: '1px solid var(--muteLine)',
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(item.href)
        const IconCmp = Icon[item.iconKey]
        const badge = item.href === '/favorites' ? savedCount : undefined
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn('flex flex-1 flex-col items-center gap-1 px-0 pt-2 pb-0.5')}
            style={{ color: active ? 'var(--ink)' : 'var(--mute)' }}
          >
            <span className="relative">
              <IconCmp size={22} />
              {badge != null && badge > 0 && (
                <span
                  className="absolute -top-1 -right-2 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold"
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    border: '1.5px solid #fff',
                  }}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            <span className="text-[10px] font-semibold tracking-tight">{t(item.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

const Icon = {
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
