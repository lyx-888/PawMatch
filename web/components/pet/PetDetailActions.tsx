'use client'

import { useCallback, useState } from 'react'

import { cn } from '@/lib/cn'
import { track } from '@/lib/analytics'
import { useFavorites, usePasses } from '@/lib/local-state'
import type { Pet } from '@/types/pet'

type Props = {
  pet: Pet
  className?: string
}

export function PetDetailActions({ pet, className }: Props): React.ReactElement {
  const favorites = useFavorites()
  const passes = usePasses()
  const [shared, setShared] = useState<'success' | 'copied' | null>(null)

  const isFavorite = favorites.has(pet.id)

  const onShare = useCallback(async () => {
    const shareData = {
      title: `${pet.name} on PawMatch SG`,
      text: `Look at ${pet.name} — available at ${pet.source.toUpperCase()}.`,
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
        View on {pet.source.replace(/_/g, ' ').toUpperCase()}
      </a>

      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          label={isFavorite ? 'Saved' : 'Save'}
          ariaLabel={
            isFavorite ? `Remove ${pet.name} from favorites` : `Save ${pet.name} to favorites`
          }
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
          label="Pass"
          ariaLabel={`Pass on ${pet.name}`}
          onClick={() => {
            const result = passes.add(pet.id)
            if (result !== 'already-present')
              track('pet_passed', { pet_id: pet.id, source: pet.source })
          }}
          intent="idle"
        />
        <ActionButton
          label={shared === 'copied' ? 'Copied' : 'Share'}
          ariaLabel={`Share ${pet.name}`}
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
