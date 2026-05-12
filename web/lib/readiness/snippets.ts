import type { Pet } from '@/types/pet'
import type { Tier } from '@/lib/matching/types'

// Adoption-readiness snippets per requirements §2.9. Each is one inline,
// expandable, dismissable card shown at the moment it's most useful —
// "contextual snippets, never homework."
//
// Triggering convention:
//   - Snippets are one-shot (id stored in localStorage on view OR dismiss).
//   - Pet-context triggers fire on the pet detail page based on the pet
//     being viewed. Favorites-count triggers fire on the favorites page.
//   - Order matters when multiple match — we return the first whose
//     `shouldTrigger` returns true. The order below mirrors the
//     spec's table top-to-bottom.

export type SnippetId =
  | 'first_hdb_dog_viewed'
  | 'first_cat_viewed'
  | 'first_special_needs_viewed'
  | 'first_stretch_tier_viewed'
  | 'third_favorite_added'
  | 'first_long_timer_favorited'

export type SnippetContext = {
  pet?: Pet
  /** Match tier for the pet on screen, when available. */
  tier?: Tier
  /** Number of saved favorites the user currently has. */
  favoritesCount?: number
  /** Whether at least one of the user's favorites qualifies as a long-timer. */
  hasLongTimerFavorite?: boolean
}

export type Snippet = {
  id: SnippetId
  title: string
  summary: string
  /** Expanded body — a few bullets, plain text, kept short. */
  bullets: string[]
  /** Slug appended to /learn for the deep-dive page. */
  learnSlug: string
  shouldTrigger: (ctx: SnippetContext) => boolean
}

// 90 days lines up with the long-timer definition in requirements §2.4.
export const LONG_TIMER_DAYS = 90
const LONG_TIMER_MS = LONG_TIMER_DAYS * 24 * 60 * 60 * 1000
const SENIOR_AGE_MONTHS = 7 * 12

export function isLongTimer(pet: Pet, now = Date.now()): boolean {
  if (now - new Date(pet.firstSeenAt).getTime() >= LONG_TIMER_MS) return true
  if (pet.ageMonths !== null && pet.ageMonths >= SENIOR_AGE_MONTHS) return true
  if (pet.tags.includes('special_needs')) return true
  return false
}

export const SNIPPETS: readonly Snippet[] = [
  {
    id: 'first_hdb_dog_viewed',
    title: 'About HDB-approved dogs',
    summary:
      'HDB caps single-flat dogs at 15 kg and 55 cm tall, from a list of 62 approved breeds + the ADORE program for mongrels.',
    bullets: [
      'HDB requires ≤ 15 kg adult weight and ≤ 55 cm shoulder height.',
      '62 small breeds qualify outright. Mongrels and crosses need ADORE.',
      'ADORE microchips, sterilises, and registers eligible mixed-breed dogs.',
      'Condo / landed: no HDB rules — check the MCST or owner agreements.',
    ],
    learnSlug: 'hdb-dog-rules',
    shouldTrigger: (ctx) => ctx.pet?.species === 'dog' && ctx.pet?.hdbApproved === true,
  },
  {
    id: 'first_cat_viewed',
    title: 'Window meshing for cats',
    summary:
      'Singapore shelters require window meshing before cat adoption. It is not optional and most landlords allow it.',
    bullets: [
      'Mesh every window the cat can reach — including kitchen and bathroom.',
      'Removable Velcro meshing is landlord-friendly and shelter-approved.',
      'Shelters do a home visit (photos count for most) before handover.',
      'Cost: SG$200–500 for a typical HDB flat, DIY kits cheaper.',
    ],
    learnSlug: 'cat-window-meshing',
    shouldTrigger: (ctx) => ctx.pet?.species === 'cat',
  },
  {
    id: 'first_special_needs_viewed',
    title: 'What "special needs" actually means',
    summary:
      'Special-needs pets can absolutely thrive — but the time and cost commitment is real and worth understanding up front.',
    bullets: [
      'Common cases: chronic skin conditions, blindness, three legs, FIV+.',
      'Cost: usually +SG$50–200/month over a typical pet.',
      'Time: daily medication or wound care for some, routine care for most.',
      'Many shelters offer free post-adoption support for the first year.',
    ],
    learnSlug: 'special-needs-adoption',
    shouldTrigger: (ctx) => ctx.pet?.tags.includes('special_needs') ?? false,
  },
  {
    id: 'first_stretch_tier_viewed',
    title: 'Why this is a "Stretch" match',
    summary:
      'Stretch means it could work with adjustments — usually one or two factors fall short rather than a hard incompatibility.',
    bullets: [
      'Look at the "Why am I seeing this" panel for the specific gaps.',
      'Small changes (more walks, child-introduction plan) often move the needle.',
      'Talk to the shelter — they know individual personalities better than any score.',
      'If the gap is permanent (size in HDB, allergies), keep browsing.',
    ],
    learnSlug: 'stretch-tier-explained',
    shouldTrigger: (ctx) => ctx.tier === 'stretch',
  },
  {
    id: 'third_favorite_added',
    title: 'Estimated monthly cost',
    summary:
      'Rough monthly running cost for an adopted pet in Singapore. One-time vet bills (sterilisation, vaccinations) are usually covered by the shelter.',
    bullets: [
      'Small dog / cat: SG$100–200/month (food, litter, treats).',
      'Medium / large dog: SG$200–400/month (more food, grooming).',
      'Vet baseline: SG$300–600/year for routine care.',
      'Pet insurance optional, ~SG$30–80/month depending on coverage.',
    ],
    learnSlug: 'monthly-cost-breakdown',
    shouldTrigger: (ctx) => (ctx.favoritesCount ?? 0) >= 3,
  },
  {
    id: 'first_long_timer_favorited',
    title: 'About long-timer pets',
    summary:
      'Pets waiting 3+ months, seniors, and special-needs cases often need adopters with patience and experience.',
    bullets: [
      'Many long-timers are perfectly trainable — they just photograph less well.',
      'Seniors (7+ years) often skip the destructive puppy phase entirely.',
      'Shelters frequently waive adoption fees for long-timers.',
      'Foster-to-adopt is common: trial the pet at home before committing.',
    ],
    learnSlug: 'long-timer-pets',
    shouldTrigger: (ctx) => Boolean(ctx.hasLongTimerFavorite),
  },
]

const SNIPPETS_BY_ID: ReadonlyMap<SnippetId, Snippet> = new Map(SNIPPETS.map((s) => [s.id, s]))

export function getSnippet(id: SnippetId): Snippet | undefined {
  return SNIPPETS_BY_ID.get(id)
}

/** Pick the first un-seen snippet whose context predicate matches. */
export function pickSnippetForContext(
  ctx: SnippetContext,
  seenIds: ReadonlySet<SnippetId>,
): Snippet | null {
  for (const snippet of SNIPPETS) {
    if (seenIds.has(snippet.id)) continue
    if (snippet.shouldTrigger(ctx)) return snippet
  }
  return null
}
