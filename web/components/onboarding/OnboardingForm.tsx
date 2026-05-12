'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'
import { mergeProfileDraft, type ProfileDraft } from '@/lib/onboarding/profile-draft'

type Props = {
  onComplete: (draft: ProfileDraft) => void
  onClose: () => void
  className?: string
}

// The three essential questions per requirements §2.2. Each is a single
// tap, no free-text input — completes in well under 60 seconds and is
// dismissable at any point via `onClose`.
//
// Submission writes the merged draft to localStorage on tap (so a user who
// answers one question then closes still has progress saved) and calls
// `onComplete` once all three are answered.

const HOUSING_OPTIONS: { value: NonNullable<ProfileDraft['housing_type']>; label: string }[] = [
  { value: 'hdb', label: 'HDB' },
  { value: 'condo', label: 'Condo' },
  { value: 'landed', label: 'Landed' },
  { value: 'other', label: 'Other' },
]

const KIDS_OPTIONS: { value: boolean; label: string }[] = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
]

const OTHER_PETS_OPTIONS: { value: NonNullable<ProfileDraft['other_pets']>; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'cats', label: 'Cats' },
  { value: 'dogs', label: 'Dogs' },
  { value: 'both', label: 'Both' },
]

export function OnboardingForm({ onComplete, onClose, className }: Props): React.ReactElement {
  const [draft, setDraft] = useState<ProfileDraft>({})

  const setHousing = (value: NonNullable<ProfileDraft['housing_type']>) => {
    const merged = mergeProfileDraft({ housing_type: value })
    setDraft(merged)
  }
  const setHasKids = (value: boolean) => {
    // Clearing kid_ages when has_kids flips to false keeps us aligned with
    // the SQL CHECK constraint on the server-side profile row.
    const merged = mergeProfileDraft(value ? { has_kids: true } : { has_kids: false, kid_ages: [] })
    setDraft(merged)
  }
  const setOtherPets = (value: NonNullable<ProfileDraft['other_pets']>) => {
    const merged = mergeProfileDraft({ other_pets: value })
    setDraft(merged)
  }

  const allAnswered =
    draft.housing_type != null && draft.has_kids != null && draft.other_pets != null

  return (
    <div
      role="dialog"
      aria-labelledby="onboarding-form-heading"
      aria-modal="false"
      className={cn('rounded-3xl border border-stone-200 bg-white p-5 shadow-md', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="onboarding-form-heading" className="text-lg font-bold text-stone-900">
          Three quick questions
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close onboarding"
          className="-mt-1 -mr-2 rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        These power your match score. You can change them anytime.
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-stone-900">Where do you live?</legend>
        <OptionGrid
          name="housing_type"
          options={HOUSING_OPTIONS}
          value={draft.housing_type ?? null}
          onSelect={setHousing}
        />
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-stone-900">Kids in your household?</legend>
        <OptionGrid
          name="has_kids"
          options={KIDS_OPTIONS}
          value={draft.has_kids ?? null}
          onSelect={setHasKids}
        />
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-stone-900">Other pets at home?</legend>
        <OptionGrid
          name="other_pets"
          options={OTHER_PETS_OPTIONS}
          value={draft.other_pets ?? null}
          onSelect={setOtherPets}
        />
      </fieldset>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
        >
          Save & continue
        </button>
        <button
          type="button"
          onClick={() => onComplete(draft)}
          disabled={!allAnswered}
          className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
        >
          Done
        </button>
      </div>
    </div>
  )
}

type OptionGridProps<T> = {
  name: string
  options: { value: T; label: string }[]
  value: T | null
  onSelect: (value: T) => void
}

function OptionGrid<T extends string | boolean>({
  name,
  options,
  value,
  onSelect,
}: OptionGridProps<T>): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${name}-legend`}
      className="mt-2 grid grid-cols-2 gap-2"
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(opt.value)}
            className={cn(
              'rounded-2xl border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700',
              selected
                ? 'border-amber-500 bg-amber-50 text-amber-900'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
