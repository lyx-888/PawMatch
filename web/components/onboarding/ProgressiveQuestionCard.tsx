'use client'

import { useEffect } from 'react'

import { cn } from '@/lib/cn'
import { track } from '@/lib/analytics'
import { t } from '@/lib/i18n'
import {
  answerProgressive,
  markProgressiveAsked,
  markProgressiveDismissed,
  useNextProgressiveQuestion,
  type ProgressiveAnswer,
  type ProgressiveContext,
  type ProgressiveQuestion,
} from '@/lib/onboarding/progressive'

type Props = {
  context: ProgressiveContext
  className?: string
}

// Renders the next eligible progressive question, or nothing. Drop this
// wherever in the tree the relevant `context` is in scope — SwipeFeed for
// favorites-count triggers, PetDetailPage for species/special-needs
// triggers, etc. Each question fires at most once (state is in
// localStorage), so the same card mounted in two places won't double-show.
export function ProgressiveQuestionCard({ context, className }: Props): React.ReactElement | null {
  const question = useNextProgressiveQuestion(context)

  // Record "asked" the moment we render. Without this, the same trigger
  // would re-fire across page navigations until the user actually answered
  // or dismissed — the spec is one-shot per question.
  useEffect(() => {
    if (question) {
      markProgressiveAsked(question.id)
      track('progressive_question_shown', { question_id: question.id })
    }
  }, [question])

  if (!question) return null
  return <Card question={question} className={className} />
}

type CardProps = {
  question: ProgressiveQuestion
  className?: string
}

function Card({ question, className }: CardProps): React.ReactElement {
  return (
    <div
      role="region"
      aria-labelledby={`progressive-${question.id}`}
      className={cn(
        'rounded-2xl border border-amber-200 bg-amber-50 p-4 text-stone-900 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p id={`progressive-${question.id}`} className="text-sm font-semibold">
          {t(question.promptKey)}
        </p>
        <button
          type="button"
          onClick={() => {
            markProgressiveDismissed(question.id)
            track('progressive_question_dismissed', { question_id: question.id })
          }}
          aria-label={t('onboarding.progressive.dismiss_aria')}
          className="-mt-1 -mr-1 rounded-full p-1 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => {
              // The discriminated union on ProgressiveAnswer guarantees the
              // value matches the question id at the type level — cast at
              // the boundary so the registry's per-question typed options
              // stay clean.
              const answer = { id: question.id, value: opt.value } as ProgressiveAnswer
              answerProgressive(answer)
              track('progressive_question_answered', {
                question_id: question.id,
                value: String(opt.value),
              })
            }}
            className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
