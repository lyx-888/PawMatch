'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

// Photo carousel used inside swipe cards and the detail page. Tap left/right
// half cycles by one; keyboard arrows do the same. Index dots reflect the
// current photo.

type Props = {
  photos: string[]
  alt: string
  className?: string
  rounded?: boolean
}

const PLACEHOLDER = '/pet-placeholder.svg'

export function PetGalleryCarousel({
  photos,
  alt,
  className,
  rounded = false,
}: Props): React.ReactElement {
  const [index, setIndex] = useState(0)
  // Some shelter URLs 404/403 (e.g. SPCA's stale duplicate listings). Track
  // which URLs failed so we render the placeholder for those, while a working
  // sibling photo still loads normally when the user advances.
  const [brokenUrls, setBrokenUrls] = useState<ReadonlySet<string>>(() => new Set())
  const safePhotos = photos.length > 0 ? photos : [PLACEHOLDER]
  const current = safePhotos[Math.min(index, safePhotos.length - 1)]
  const renderedSrc = brokenUrls.has(current) ? PLACEHOLDER : current

  const advance = (delta: number) => {
    setIndex((prev) => {
      const next = prev + delta
      if (next < 0) return safePhotos.length - 1
      if (next >= safePhotos.length) return 0
      return next
    })
  }

  return (
    <div
      className={cn(
        'relative aspect-[4/5] w-full overflow-hidden bg-stone-100 select-none',
        rounded && 'rounded-2xl',
        className,
      )}
      role="group"
      aria-label={t('gallery.aria', { alt })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={renderedSrc}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        draggable={false}
        // SPCA's Cloudflare hotlink protection 403s some images when a Referer
        // header is sent (selectively — e.g. IMG_0103.jpeg). Stripping the
        // referrer makes the request look like a direct fetch and they load.
        referrerPolicy="no-referrer"
        onError={() => {
          if (current === PLACEHOLDER || brokenUrls.has(current)) return
          setBrokenUrls((prev) => new Set(prev).add(current))
        }}
      />
      {safePhotos.length > 1 && (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 w-1/3 cursor-pointer outline-none focus-visible:bg-black/10"
            onClick={() => advance(-1)}
            aria-label={t('gallery.prev')}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 w-1/3 cursor-pointer outline-none focus-visible:bg-black/10"
            onClick={() => advance(1)}
            aria-label={t('gallery.next')}
          />
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center gap-1 px-4">
            {safePhotos.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full bg-white/40 transition',
                  i === index && 'bg-white',
                )}
                aria-hidden="true"
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
