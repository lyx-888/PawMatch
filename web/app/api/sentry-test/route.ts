// Delete this route after confirming Sentry receives errors. Phase 0 acceptance only.
export const dynamic = 'force-dynamic'

export async function GET() {
  throw new Error('Sentry test error from /api/sentry-test')
}
