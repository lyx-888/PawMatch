import { BottomNav } from './BottomNav'
import { RightRail } from './RightRail'
import { SideNav } from './SideNav'

// The responsive app shell, ported from the claudedesign prototype.
//
// Desktop (≥1024px): 3-col grid (280px SideNav / 1fr main / 340px RightRail).
// Both rails are sticky full-height, scroll internally.
//
// Mobile (≤1023.98px): single-column with a sticky BottomNav. Each page
// still controls its own internal layout inside the main column. We don't
// lock the viewport on mobile here because most pages (favorites list,
// search results, pet detail) need to scroll normally — the prototype's
// `overflow:hidden` lock only makes sense on the swipe surface and can be
// added at the page level later if we want it.

type Props = {
  children: React.ReactNode
}

export function Shell({ children }: Props): React.ReactElement {
  return (
    <div className="shell">
      <SideNav />
      <div className="main-column">{children}</div>
      <RightRail />
      <BottomNav />
    </div>
  )
}
