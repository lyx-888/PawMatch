'use client'

import posthog from 'posthog-js'

// PostHog wrapper. v1 is anonymous-only: we set `disable_session_recording: true`
// and never `identify()` a user. Events match the Phase 1 task 1.16 list. Initialised
// once, lazily, on the first call so the home page doesn't pay the cost on SSR.

let initialised = false

function ensureInit(): boolean {
  if (initialised) return true
  if (typeof window === 'undefined') return false
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return false
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'
  posthog.init(key, {
    api_host: host,
    capture_pageview: 'history_change',
    autocapture: false,
    disable_session_recording: true,
    persistence: 'localStorage',
    person_profiles: 'never', // PDPA-friendly: keep events anonymous
  })
  initialised = true
  return true
}

export type AnalyticsEvent =
  | 'pet_viewed'
  | 'pet_favorited'
  | 'pet_passed'
  | 'pet_shared'
  | 'swipe_session_started'
  | 'swipe_5_complete'
  | 'handoff_clicked'
  // Phase 2.4 onboarding funnel. Names line up with the spec's drop-off
  // stages (prompt shown → started → completed / dismissed) so we can see
  // exactly where users fall off.
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_dismissed'
  | 'onboarding_form_closed'
  // Phase 2.5 progressive profiling. Each question is one-shot, so the
  // shown/dismissed/answered triple lets us see per-question completion
  // rates without ambiguity.
  | 'progressive_question_shown'
  | 'progressive_question_dismissed'
  | 'progressive_question_answered'

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  if (!ensureInit()) return
  posthog.capture(event, properties)
}
