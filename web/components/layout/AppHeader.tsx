import { cn } from '@/lib/cn'

type Props = {
  // Props are retained so existing callers (search, favorites, learn, compare)
  // don't need to be updated in lockstep. The stats line and mobile brand
  // wordmark were removed per the home-page redesign — AppHeader is now a
  // sticky safe-area-top spacer on mobile that gives notch breathing room,
  // and renders nothing on desktop (SideNav owns identity there).
  totalPets?: number
  activeShelterCount?: number
  lastScrapedAt?: string | null
  className?: string
}

export function AppHeader({ className }: Props): React.ReactElement {
  return (
    <header
      aria-hidden="true"
      className={cn('sticky top-0 z-25 lg:hidden', 'pt-[env(safe-area-inset-top)]', className)}
      style={{ background: 'rgba(250, 246, 240, 0.85)' }}
    />
  )
}
