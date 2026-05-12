import { errorResponse, jsonResponse } from '@/lib/api/responses'
import { getCurrentUser } from '@/lib/auth/session'
import { sanitizeNote, NOTE_MAX_LENGTH } from '@/lib/notes/sanitize'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ pet_id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PatchBody = { note_text?: string | null }

// PATCH /api/favorites/:pet_id — update note_text on the authenticated user's
// favorite row. Phase 2.8 spec: ≤ 500 chars, plain text, HTML sanitized.
//
// Anonymous users don't hit this route — their notes live in localStorage.
// Phase 3's anon-to-user migration is what copies them server-side.
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return errorResponse(401, 'Not authenticated.')

  const { pet_id: petId } = await params
  if (!UUID_RE.test(petId)) return errorResponse(400, 'Invalid pet id.')

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return errorResponse(400, 'Body must be valid JSON.')
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'note_text')) {
    return errorResponse(400, 'Body must include `note_text`.')
  }

  const raw = body.note_text
  let cleaned: string | null
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    cleaned = null
  } else if (typeof raw === 'string') {
    if (raw.length > NOTE_MAX_LENGTH * 4) {
      // Refuse pathological payloads up front so we don't spend cycles
      // sanitizing megabytes — the 4x slack lets typical entity-heavy text
      // through, since sanitize strips entities and trims to 500.
      return errorResponse(400, `note_text must be ≤ ${NOTE_MAX_LENGTH} characters.`)
    }
    cleaned = sanitizeNote(raw)
    if (cleaned.length === 0) cleaned = null
  } else {
    return errorResponse(400, 'note_text must be a string or null.')
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('favorites')
    .update({ note_text: cleaned })
    .eq('user_id', user.id)
    .eq('pet_id', petId)
    .select('user_id, pet_id, note_text, created_at')
    .maybeSingle()

  if (error) return errorResponse(500, `Failed to update note: ${error.message}`)
  if (!data) return errorResponse(404, 'Favorite not found.')

  return jsonResponse(data)
}
