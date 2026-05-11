import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { parsePetQuery } from '@/lib/api/pet-filters'
import { errorResponse, jsonResponse } from '@/lib/api/responses'
import { listPets } from '@/lib/db/pets'

export async function GET(request: NextRequest): Promise<Response> {
  let filters
  try {
    filters = parsePetQuery(request.nextUrl.searchParams)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return errorResponse(400, 'Invalid query parameters', { issues: err.issues })
    }
    throw err
  }

  const { pets, nextCursor } = await listPets(filters)
  return jsonResponse({ pets, nextCursor })
}
