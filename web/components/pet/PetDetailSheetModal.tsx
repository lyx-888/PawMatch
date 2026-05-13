'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { t } from '@/lib/i18n'

// Modal chrome for the bottom-sheet pet detail. Wraps the sheet content
// in a backdrop + animated container.
//
// Dismissal modes (all should feel native to a phone sheet):
//   1. Tap the backdrop outside the sheet
//   2. Tap+drag the handle bar at the top downward past the threshold
//   3. Press Escape (keyboard, desktop convenience)
//
// No close button — the drag handle and backdrop are the explicit
// affordances per the user's request.

type Props = {
  children: React.ReactNode
}

const DISMISS_THRESHOLD_PX = 110

export function PetDetailSheetModal({ children }: Props): React.ReactElement {
  const router = useRouter()
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const dragStartY = useRef(0)

  // Escape closes the sheet — standard modal contract.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  // Lock body scroll while the sheet is open. The Shell's grid + sticky
  // bottom nav are still rendered behind the backdrop; without this lock,
  // scrolling the page through the sheet feels wrong.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const onHandlePointerDown = (e: React.PointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    setDragging(true)
  }

  const onHandlePointerMove = (e: React.PointerEvent): void => {
    if (!dragging) return
    // Only allow downward drag — upward should do nothing (no over-pull).
    const dy = Math.max(0, e.clientY - dragStartY.current)
    setDragY(dy)
  }

  const onHandlePointerUp = (e: React.PointerEvent): void => {
    if (!dragging) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)

    if (dragY > DISMISS_THRESHOLD_PX) {
      // Slide the rest of the way out, then pop the route.
      setClosing(true)
      window.setTimeout(() => router.back(), 220)
    } else {
      // Spring back to anchored position.
      setDragY(0)
    }
  }

  // The transform combines the user's drag offset with the closing slide.
  // When closing we push the sheet down by 100% of its own height (close to
  // full off-screen) so the motion reads as natural dismissal.
  const sheetTransform = closing ? 'translateY(100%)' : `translateY(${dragY}px)`
  // Only animate transform when we're NOT actively dragging — during drag
  // we want 1:1 pointer follow, no easing.
  const sheetTransition = dragging ? 'none' : 'transform .25s cubic-bezier(.2,.8,.2,1)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pet_sheet.modal_label')}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: 'rgba(20,16,10,0.36)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        animation: closing ? undefined : 'sheet-fadein .22s ease',
        opacity: closing ? 0 : 1,
        transition: closing ? 'opacity .22s ease' : undefined,
      }}
      onClick={() => router.back()}
    >
      <div
        // Stop click bubbling so taps inside the sheet don't dismiss it.
        // Backdrop dismissal only triggers when the click target IS the backdrop.
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-t-3xl"
        style={{
          maxWidth: 640,
          maxHeight: '92dvh',
          background: 'var(--bg)',
          boxShadow: '0 -24px 50px -18px rgba(40,32,24,0.32)',
          animation: closing ? undefined : 'sheet-slideup .3s cubic-bezier(.2,.8,.2,1)',
          transform: sheetTransform,
          transition: sheetTransition,
          overflowY: 'auto',
          // Hide the scrollbar — the sheet stays clean per spec. WebKit needs
          // its own rule via globals.css `::-webkit-scrollbar` (already 0×0).
          scrollbarWidth: 'none',
        }}
      >
        {/* Drag handle — tap+drag downward to dismiss. Big invisible hit
            target above the visible bar so finger-thumbs catch it easily.
            touchAction:none stops the browser from claiming the gesture as
            a scroll while we drive the sheet's transform manually. */}
        <div
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          role="button"
          aria-label={t('pet_sheet.handle_aria')}
          tabIndex={0}
          className="flex w-full cursor-grab justify-center pt-2.5 pb-3 active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <span
            aria-hidden="true"
            className="block h-1 w-9 rounded-full transition-colors"
            style={{
              background: dragging ? 'var(--ink)' : 'var(--mute)',
              opacity: dragging ? 0.6 : 0.35,
            }}
          />
        </div>
        {children}
      </div>
    </div>
  )
}
