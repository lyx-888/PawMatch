'use client'

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SwipeCard } from './SwipeCard'
import { cn } from '@/lib/cn'
import { addFavorite, addPass, useFavorites } from '@/lib/local-state'
import type { Pet } from '@/types/pet'

type Decision = 'favorite' | 'pass'

type Props = {
  pets: Pet[]
  onDecision?: (decision: Decision, pet: Pet) => void
  onEmpty?: () => void
}

const SWIPE_THRESHOLD = 110 // px

export function SwipeStack({ pets, onDecision, onEmpty }: Props): React.ReactElement {
  const [index, setIndex] = useState(0)
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null)
  const { capReached } = useFavorites()
  const prefersReducedMotion = useReducedMotion()

  // Pre-load the next card's primary photo to make the swipe feel instant.
  useEffect(() => {
    const next = pets[index + 1]
    if (next?.photoUrls[0]) {
      const img = new Image()
      img.src = next.photoUrls[0]
    }
  }, [index, pets])

  useEffect(() => {
    if (pets.length > 0 && index >= pets.length) onEmpty?.()
  }, [index, pets.length, onEmpty])

  const current = pets[index]

  const apply = useCallback(
    (decision: Decision) => {
      if (!current) return
      if (decision === 'favorite') addFavorite(current.id)
      else addPass(current.id)
      onDecision?.(decision, current)
      setPendingDecision(decision)
      // Brief delay so the user sees the exit animation before the next card lands.
      window.setTimeout(
        () => {
          setPendingDecision(null)
          setIndex((i) => i + 1)
        },
        prefersReducedMotion ? 80 : 240,
      )
    },
    [current, onDecision, prefersReducedMotion],
  )

  // Keyboard accessibility: Left/Right arrows mirror swipe gestures. Wired at
  // window level so the user doesn't need to focus the card first.
  useEffect(() => {
    if (!current) return
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      }
      if (event.key === 'ArrowLeft') apply('pass')
      else if (event.key === 'ArrowRight') apply('favorite')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, apply])

  if (!current) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-stone-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-stone-900">You&apos;ve seen everyone here.</p>
        <p className="text-sm text-stone-600">
          Widen your filters or check back tomorrow — new pets get listed daily.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/4] w-full">
        <AnimatePresence>
          <SwipeCardLayer
            key={current.id}
            pet={current}
            prefersReducedMotion={Boolean(prefersReducedMotion)}
            pendingDecision={pendingDecision}
            onSettle={apply}
          />
        </AnimatePresence>
      </div>

      <div
        className="flex items-center justify-center gap-6"
        role="group"
        aria-label="Swipe actions"
      >
        <ActionButton
          intent="pass"
          onClick={() => apply('pass')}
          ariaLabel={`Pass on ${current.name}`}
        />
        <ActionButton
          intent="favorite"
          onClick={() => apply('favorite')}
          disabled={capReached}
          ariaLabel={`Add ${current.name} to favorites`}
        />
      </div>
      {capReached && (
        <p className="text-center text-sm text-amber-700">
          You&apos;ve hit the 200-favorite anonymous cap. Create an account to keep saving.
        </p>
      )}
    </div>
  )
}

function SwipeCardLayer({
  pet,
  prefersReducedMotion,
  pendingDecision,
  onSettle,
}: {
  pet: Pet
  prefersReducedMotion: boolean
  pendingDecision: Decision | null
  onSettle: (decision: Decision) => void
}): React.ReactElement {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12])
  const opacity = useTransform(x, [-220, -120, 0, 120, 220], [0, 1, 1, 1, 0])

  const exit = useMemo(() => {
    if (pendingDecision === 'favorite')
      return prefersReducedMotion ? { opacity: 0 } : { x: 600, opacity: 0 }
    if (pendingDecision === 'pass')
      return prefersReducedMotion ? { opacity: 0 } : { x: -600, opacity: 0 }
    return { opacity: 0 }
  }, [pendingDecision, prefersReducedMotion])

  return (
    <motion.div
      className="absolute inset-0"
      drag={prefersReducedMotion ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      style={{
        x: prefersReducedMotion ? 0 : x,
        rotate: prefersReducedMotion ? 0 : rotate,
        opacity,
      }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) onSettle('favorite')
        else if (info.offset.x < -SWIPE_THRESHOLD) onSettle('pass')
      }}
      initial={prefersReducedMotion ? { opacity: 0 } : { y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={exit}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <SwipeCard pet={pet} />
    </motion.div>
  )
}

function ActionButton({
  intent,
  onClick,
  disabled,
  ariaLabel,
}: {
  intent: Decision
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
}): React.ReactElement {
  const isPass = intent === 'pass'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-md ring-1 ring-stone-200 transition active:scale-95 disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
        isPass ? 'text-stone-700 hover:bg-stone-100' : 'text-rose-600 hover:bg-rose-50',
      )}
    >
      {isPass ? '✕' : '♥'}
    </button>
  )
}
