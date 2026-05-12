'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { useFavorites, useFavoriteNote } from '@/lib/local-state'
import { NOTE_MAX_LENGTH, sanitizeNote } from '@/lib/notes/sanitize'

type Props = {
  petId: string
  petName: string
  className?: string
  /** Hide entirely until the pet is favorited. Default true. */
  requireFavorited?: boolean
}

const DEBOUNCE_MS = 400

export function FavoriteNote({
  petId,
  petName,
  className,
  requireFavorited = true,
}: Props): React.ReactElement | null {
  const { has: isFavorited } = useFavorites()
  const { note, setNote } = useFavoriteNote(petId)
  const [draft, setDraft] = useState(note)
  const [saved, setSaved] = useState(false)
  const lastSavedRef = useRef(note)
  const inputId = useId()

  // Keep the textarea in sync when the underlying note changes from somewhere
  // else (another tab via the storage event, or removeFavorite clearing it).
  useEffect(() => {
    if (note !== lastSavedRef.current) {
      setDraft(note)
      lastSavedRef.current = note
    }
  }, [note])

  // Debounced write: typing pauses for 400ms commits to localStorage. Keeps
  // the textarea responsive while still persisting before the user navigates.
  useEffect(() => {
    if (draft === lastSavedRef.current) return
    const handle = window.setTimeout(() => {
      setNote(draft)
      lastSavedRef.current = sanitizeNote(draft).slice(0, NOTE_MAX_LENGTH)
      setSaved(true)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [draft, setNote])

  // The "Saved" indicator should fade out so it doesn't draw attention after
  // the user has moved on. 2s is long enough to register, short enough to
  // not feel like clutter.
  useEffect(() => {
    if (!saved) return
    const handle = window.setTimeout(() => setSaved(false), 2000)
    return () => window.clearTimeout(handle)
  }, [saved])

  if (requireFavorited && !isFavorited(petId)) return null

  const remaining = NOTE_MAX_LENGTH - draft.length

  return (
    <section className={cn('flex flex-col gap-1', className)} aria-labelledby={`${inputId}-label`}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          id={`${inputId}-label`}
          htmlFor={inputId}
          className="text-sm font-medium text-stone-900"
        >
          {t('note.label')}
        </label>
        <span
          className={cn(
            'text-xs tabular-nums',
            remaining < 0 ? 'text-rose-700' : remaining < 50 ? 'text-amber-700' : 'text-stone-500',
          )}
          aria-live="polite"
        >
          {saved
            ? t('note.saved')
            : t('note.counter', { used: draft.length, max: NOTE_MAX_LENGTH })}
        </span>
      </div>
      <textarea
        id={inputId}
        value={draft}
        onChange={(e) => {
          // Cap on input so the count never goes negative — sanitize on every
          // keystroke would surprise the user mid-paste, so we keep that for
          // the write path only.
          const next = e.target.value.slice(0, NOTE_MAX_LENGTH)
          setDraft(next)
        }}
        placeholder={t('note.placeholder', { name: petName })}
        rows={3}
        maxLength={NOTE_MAX_LENGTH}
        className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      />
      <p className="text-xs text-stone-500">{t('note.footer')}</p>
    </section>
  )
}
