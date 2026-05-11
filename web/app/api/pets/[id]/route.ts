import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/lib/api/responses'
import { getPetById } from '@/lib/db/pets'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) {
    return errorResponse(400, 'Invalid pet id')
  }

  const pet = await getPetById(parsed.data.id)
  if (!pet) return errorResponse(404, 'Pet not found')
  return jsonResponse(pet)
}
