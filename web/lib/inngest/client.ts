import { Inngest } from 'inngest'

// Inngest client — single shared instance for both the function definitions
// and the `/api/inngest` serve route.
//
// Event names follow the `{domain}/{action}` convention so Inngest's UI
// groups them sensibly. Payloads are validated where they're consumed
// rather than at the SDK boundary.

export const inngest = new Inngest({
  id: 'pawmatch',
})

export type RecomputeUserEvent = {
  data: { user_id: string }
}

export type RecomputePetEvent = {
  data: { pet_id: string }
}
