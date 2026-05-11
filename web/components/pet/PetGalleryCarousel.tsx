'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'

// Photo carousel used inside swipe cards and the detail page. Tap left/right
// half cycles by one; keyboard arrows do the same. Index dots reflect the
// current photo.

type Props = {
  photos: string[]
  alt: string
  className?: string
  rounded?: boolean
}

export function PetGalleryCarousel({
  photos,
  alt,
  className,
  rounded = false,
}: Props): React.ReactElement {
  const [index, setIndex] = useState(0)
  const safePhotos = photos.length > 0 ? photos : ['/pet-placeholder.svg']
  const current = safePhotos[Math.min(index, safePhotos.length - 1)]

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
      aria-label={`${alt} photo gallery`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
      {safePhotos.length > 1 && (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 w-1/3 cursor-pointer outline-none focus-visible:bg-black/10"
            onClick={() => advance(-1)}
            aria-label="Previous photo"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 w-1/3 cursor-pointer outline-none focus-visible:bg-black/10"
            onClick={() => advance(1)}
            aria-label="Next photo"
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
