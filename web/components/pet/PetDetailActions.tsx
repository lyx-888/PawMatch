'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { cn } from '@/lib/cn'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import { useFavorites, usePasses } from '@/lib/local-state'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
  className?: string
}

export function PetDetailActions({ pet, className }: Props): React.ReactElement {
  const router = useRouter()
  const favorites = useFavorites()
  const passes = usePasses()
  const [shared, setShared] = useState<'success' | 'copied' | null>(null)
  const [passed, setPassed] = useState(false)

  const isFavorite = favorites.has(pet.id)
  const isPassed = passed || passes.has(pet.id)

  const onPass = useCallback(() => {
    const result = passes.add(pet.id)
    if (result !== 'already-present') track('pet_passed', { pet_id: pet.id, source: pet.source })
    setPassed(true)
    // Brief confirmation, then bounce back to wherever they came from. Falls
    // back to the home swipe stack if this was a deep-link entry with no
    // back-history (e.g. opened from a share URL).
    window.setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) router.back()
      else router.push('/')
    }, 450)
  }, [passes, pet, router])

  const onShare = useCallback(async () => {
    const shareData = {
      title: t('actions.share_title', {
        name: pet.name,
        brand: `${t('app.brand')} ${t('app.brand_suffix')}`,
      }),
      text: t('actions.share_text', { name: pet.name, source: pet.source.toUpperCase() }),
      url: typeof window !== 'undefined' ? window.location.href : pet.sourceUrl,
    }
    track('pet_shared', { pet_id: pet.id, source: pet.source })
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShared('success')
        return
      }
      await navigator.clipboard.writeText(shareData.url)
      setShared('copied')
    } catch {
      // user cancelled, fine
    }
  }, [pet])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <a
        href={pet.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('handoff_clicked', { pet_id: pet.id, source: pet.source })}
        className="flex h-12 w-full items-center justify-center rounded-full bg-amber-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {t('pet_detail.view_on', { source: pet.source.replace(/_/g, ' ').toUpperCase() })}
      </a>

      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          label={isFavorite ? t('actions.saved') : t('actions.save')}
          ariaLabel={t(isFavorite ? 'actions.save_aria_remove' : 'actions.save_aria_add', {
            name: pet.name,
          })}
          onClick={() => {
            if (isFavorite) favorites.remove(pet.id)
            else {
              const result = favorites.add(pet.id)
              if (result === 'added') track('pet_favorited', { pet_id: pet.id, source: pet.source })
            }
          }}
          disabled={!isFavorite && favorites.capReached}
          intent={isFavorite ? 'active' : 'idle'}
        />
        <ActionButton
          label={isPassed ? t('actions.passed') : t('actions.pass')}
          ariaLabel={t('actions.pass_aria', { name: pet.name })}
          onClick={onPass}
          disabled={passed}
          intent={isPassed ? 'active' : 'idle'}
        />
        <ActionButton
          label={shared === 'copied' ? t('actions.copied') : t('actions.share')}
          ariaLabel={t('actions.share_aria', { name: pet.name })}
          onClick={onShare}
          intent={shared ? 'active' : 'idle'}
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  ariaLabel,
  onClick,
  disabled,
  intent,
}: {
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  intent: 'idle' | 'active'
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex h-11 items-center justify-center rounded-full border text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
        intent === 'active'
          ? 'border-amber-600 bg-amber-50 text-amber-800'
          : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
        disabled && 'opacity-50',
      )}
    >
      {label}
    </button>
  )
}
