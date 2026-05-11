import { jsonResponse } from '@/lib/api/responses'
import { getHealthSummary } from '@/lib/db/pets'

export async function GET(): Promise<Response> {
  const summary = await getHealthSummary()
  const httpStatus = summary.db === 'ok' ? 200 : 503
  return jsonResponse(summary, { status: httpStatus })
}
