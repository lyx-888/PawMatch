import { inngest } from './client'
import { generateDailyPicks } from './picks'
import { recomputeForPet, recomputeForUser } from './recompute'
import { createServerClient } from '@/lib/db/client'

type ClaimedJob = { id: number; kind: string; target_id: string | null }

// Per-user recompute. Triggered by the queue drain (below) or directly by
// profile-update API routes (Phase 3) for instant feedback.
export const recomputeUserFn = inngest.createFunction(
  {
    id: 'match-score-recompute-user',
    name: 'Match score — recompute user',
    triggers: [{ event: 'match_score/recompute_user' }],
  },
  async ({ event, step }) => {
    return step.run('recompute', () => recomputeForUser(event.data.user_id))
  },
)

// Per-pet recompute. The scraper writes can produce a burst of these; we
// rely on the drain cron's batch claim to spread them out and the queue's
// partial unique index to coalesce duplicates.
export const recomputePetFn = inngest.createFunction(
  {
    id: 'match-score-recompute-pet',
    name: 'Match score — recompute pet',
    triggers: [{ event: 'match_score/recompute_pet' }],
  },
  async ({ event, step }) => {
    return step.run('recompute', () => recomputeForPet(event.data.pet_id))
  },
)

// Queue drain. Spec §2.6b says every 30s; Inngest cron precision is 1m.
// The queue is partial-unique-indexed so coalescing is fine, and a 60s lag
// on recompute is well under any user-visible threshold for Phase 2.
const DRAIN_BATCH_SIZE = 50

export const drainQueueFn = inngest.createFunction(
  {
    id: 'match-score-drain-queue',
    name: 'Match score — drain queue',
    triggers: [{ cron: '*/1 * * * *' }],
  },
  async ({ step }) => {
    const claimed = await step.run('claim', async (): Promise<ClaimedJob[]> => {
      const client = createServerClient()
      const { data, error } = await client.rpc('recompute_queue_claim', {
        batch_size: DRAIN_BATCH_SIZE,
      })
      if (error) throw new Error(`claim failed: ${error.message}`)
      return (data ?? []) as ClaimedJob[]
    })

    if (claimed.length === 0) return { fanned_out: 0 }

    await step.sendEvent('fan-out', [
      ...claimed
        .filter((j: ClaimedJob) => j.kind === 'user' && j.target_id !== null)
        .map((j: ClaimedJob) => ({
          name: 'match_score/recompute_user' as const,
          data: { user_id: j.target_id as string },
        })),
      ...claimed
        .filter((j: ClaimedJob) => j.kind === 'pet' && j.target_id !== null)
        .map((j: ClaimedJob) => ({
          name: 'match_score/recompute_pet' as const,
          data: { pet_id: j.target_id as string },
        })),
    ])

    // Delete the claimed rows now that they've been fanned out. If the
    // recompute itself fails, Inngest's default retry policy applies on
    // the per-event function — we don't re-enqueue manually here.
    await step.run('cleanup', async () => {
      const client = createServerClient()
      const { error } = await client
        .from('recompute_queue')
        .delete()
        .in(
          'id',
          claimed.map((j: ClaimedJob) => j.id),
        )
      if (error) throw new Error(`cleanup failed: ${error.message}`)
    })

    return { fanned_out: claimed.length }
  },
)

// Possibly Yours daily picks per spec §2.4. Runs at 22:00 UTC = 06:00 SGT
// (Singapore is UTC+8 year-round, no DST). Generates 5-pet picks for every
// user active in the last 14 days; inactive users are skipped so we stay
// comfortably under the Inngest free-tier event budget.
export const generateDailyPicksFn = inngest.createFunction(
  {
    id: 'picks-generate-daily',
    name: 'Possibly Yours — generate daily picks',
    triggers: [{ cron: '0 22 * * *' }],
  },
  async ({ step }) => {
    return step.run('generate', () => generateDailyPicks())
  },
)

// Nightly reconciliation per spec §2.6b. Phase 2 just establishes the cron
// scaffolding; the RPC it would call (finding users whose profile is newer
// than their freshest match_scores.computed_at) lands in Phase 3 once
// real authenticated users exist.
export const reconcileFn = inngest.createFunction(
  {
    id: 'match-score-reconcile',
    name: 'Match score — reconcile',
    triggers: [{ cron: '0 18 * * *' }], // 02:00 SGT
  },
  async ({ step }) => {
    return step.run('reconcile', async () => {
      const client = createServerClient()
      const { data, error } = await client.rpc('recompute_queue_reconcile_users')
      if (error) {
        // RPC optional in Phase 2 — skip without failing the cron if it
        // hasn't been added yet.
        if (error.message.includes('does not exist')) return { enqueued: 0 }
        throw new Error(`reconcile failed: ${error.message}`)
      }
      return { enqueued: (data as { count: number } | null)?.count ?? 0 }
    })
  },
)
