'use client'

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SwipeCard } from './SwipeCard'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
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
      // Match the rendered <img>'s policy so this preload populates the same
      // browser cache entry the carousel will read — see PetGalleryCarousel.
      img.referrerPolicy = 'no-referrer'
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
      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 rounded-[22px] p-8 text-center"
        style={{
          background: 'var(--surface)',
          boxShadow: 'inset 0 0 0 1px var(--muteLine)',
          color: 'var(--ink)',
        }}
      >
        <p className="display text-lg">{t('swipe.empty_title')}</p>
        <p className="text-sm" style={{ color: 'var(--mute)' }}>
          {t('swipe.empty_body')}
        </p>
      </div>
    )
  }

  // Card uses flex-1 (not aspect-[3/4]) so it fills the available viewport
  // height. The home page locks scroll, so without this the card would
  // either get clipped or force a scroll on short phones.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="relative min-h-0 w-full flex-1">
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
        className="flex shrink-0 items-center justify-center gap-3.5"
        role="group"
        aria-label={t('swipe.actions_label')}
      >
        <ActionButton
          intent="pass"
          onClick={() => apply('pass')}
          ariaLabel={t('swipe.pass_aria', { name: current.name })}
        />
        <ActionButton
          intent="info"
          href={`/pets/${current.id}`}
          ariaLabel={t('pet_card.more_about', { name: current.name })}
        />
        <ActionButton
          intent="favorite"
          onClick={() => apply('favorite')}
          disabled={capReached}
          ariaLabel={t('swipe.favorite_aria', { name: current.name })}
        />
      </div>
      {capReached && (
        <p className="shrink-0 text-center text-sm" style={{ color: 'var(--primary)' }}>
          {t('swipe.cap_warning')}
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

type Intent = Decision | 'info'

type ActionButtonProps = {
  intent: Intent
  ariaLabel: string
  onClick?: () => void
  href?: string
  disabled?: boolean
}

// Three-button row matching the prototype: pass (52px white), info (48px
// white, links to detail), favorite (56px clay primary with shadow). All
// use the same hit-target component for consistent press feedback.
function ActionButton({
  intent,
  onClick,
  href,
  disabled,
  ariaLabel,
}: ActionButtonProps): React.ReactElement {
  const size = intent === 'pass' ? 52 : intent === 'info' ? 48 : 56
  const isFavorite = intent === 'favorite'
  const style: React.CSSProperties = {
    width: size,
    height: size,
    background: isFavorite ? 'var(--primary)' : 'var(--surface)',
    color: isFavorite ? '#fff' : intent === 'pass' ? 'var(--mute)' : 'var(--ink)',
    boxShadow: isFavorite
      ? '0 10px 20px rgba(181,101,74,0.30)'
      : '0 4px 14px rgba(30,24,16,0.10), inset 0 0 0 1px rgba(30,24,16,0.06)',
  }
  const sharedClass = cn(
    'inline-flex items-center justify-center rounded-full transition-transform duration-100 active:scale-[0.94] disabled:opacity-50',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2',
  )
  const icon = intent === 'pass' ? <PassIcon /> : intent === 'info' ? <InfoIcon /> : <HeartIcon />

  if (intent === 'info' && href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={sharedClass} style={style}>
        {icon}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={sharedClass}
      style={style}
    >
      {icon}
    </button>
  )
}

function PassIcon(): React.ReactElement {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

function InfoIcon(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  )
}

function HeartIcon(): React.ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.1C1 8.9 2.7 5.7 5.7 5.2c2-.3 3.9.7 4.8 2.4l1.5 2.4 1.5-2.4c.9-1.7 2.8-2.7 4.8-2.4 3 .5 4.7 3.7 3.3 6.7C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}
