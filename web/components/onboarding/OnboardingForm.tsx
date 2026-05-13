'use client'

import { useState } from 'react'

import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
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

const HOUSING_OPTIONS: { value: NonNullable<ProfileDraft['housing_type']>; labelKey: string }[] = [
  { value: 'hdb', labelKey: 'onboarding.opt.hdb' },
  { value: 'condo', labelKey: 'onboarding.opt.condo' },
  { value: 'landed', labelKey: 'onboarding.opt.landed' },
  { value: 'other', labelKey: 'onboarding.opt.other' },
]

const KIDS_OPTIONS: { value: boolean; labelKey: string }[] = [
  { value: true, labelKey: 'onboarding.opt.yes' },
  { value: false, labelKey: 'onboarding.opt.no' },
]

const OTHER_PETS_OPTIONS: { value: NonNullable<ProfileDraft['other_pets']>; labelKey: string }[] = [
  { value: 'none', labelKey: 'onboarding.opt.none' },
  { value: 'cats', labelKey: 'onboarding.opt.cats' },
  { value: 'dogs', labelKey: 'onboarding.opt.dogs' },
  { value: 'both', labelKey: 'onboarding.opt.both' },
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
      className={cn('rounded-3xl p-5', className)}
      style={{
        background: 'var(--surface)',
        boxShadow: 'inset 0 0 0 1px var(--muteLine), 0 8px 24px -10px rgba(40,32,24,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="onboarding-form-heading"
          className="display text-lg"
          style={{ color: 'var(--ink)' }}
        >
          {t('onboarding.form_heading')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('onboarding.form_close_aria')}
          className="-mt-1 -mr-2 rounded-full p-2 transition hover:bg-black/[0.04]"
          style={{ color: 'var(--mute)' }}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </div>
      <p className="mt-1 text-sm" style={{ color: 'var(--mute)' }}>
        {t('onboarding.form_intro')}
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {t('onboarding.q_housing')}
        </legend>
        <OptionGrid
          name="housing_type"
          options={HOUSING_OPTIONS}
          value={draft.housing_type ?? null}
          onSelect={setHousing}
        />
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {t('onboarding.q_kids')}
        </legend>
        <OptionGrid
          name="has_kids"
          options={KIDS_OPTIONS}
          value={draft.has_kids ?? null}
          onSelect={setHasKids}
        />
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {t('onboarding.q_other_pets')}
        </legend>
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
          className="rounded-full px-3 py-1.5 text-sm font-medium transition"
          style={{ color: 'var(--mute)' }}
        >
          {t('onboarding.form_save')}
        </button>
        <button
          type="button"
          onClick={() => onComplete(draft)}
          disabled={!allAnswered}
          className="rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed"
          style={{
            background: allAnswered ? 'var(--primary)' : 'var(--surfaceAlt)',
            color: allAnswered ? '#fff' : 'var(--mute)',
            boxShadow: allAnswered ? '0 6px 14px rgba(181,101,74,0.30)' : 'none',
          }}
        >
          {t('onboarding.form_done')}
        </button>
      </div>
    </div>
  )
}

type OptionGridProps<T> = {
  name: string
  options: { value: T; labelKey: string }[]
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
            className="rounded-2xl px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--primary)]"
            style={{
              background: selected ? 'var(--primarySoft)' : 'var(--surface)',
              color: selected ? 'var(--primary)' : 'var(--ink)',
              boxShadow: selected
                ? 'inset 0 0 0 1px var(--primary)'
                : 'inset 0 0 0 1px var(--muteLine)',
            }}
          >
            {t(opt.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
