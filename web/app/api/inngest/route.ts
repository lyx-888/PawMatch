import { serve } from 'inngest/next'

import { inngest } from '@/lib/inngest/client'
import { drainQueueFn, reconcileFn, recomputePetFn, recomputeUserFn } from '@/lib/inngest/functions'

// Inngest webhook endpoint. Inngest's hosted scheduler calls this URL to:
//   * deliver events to our function handlers
//   * trigger cron runs
//   * sync function definitions on each deploy
//
// Signing key (INNGEST_SIGNING_KEY) is verified by the SDK automatically.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [recomputeUserFn, recomputePetFn, drainQueueFn, reconcileFn],
})
