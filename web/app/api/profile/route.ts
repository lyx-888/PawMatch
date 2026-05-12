import { errorResponse, jsonResponse } from '@/lib/api/responses'
import { getCurrentUser } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ProfilePatchSchema, type Profile } from '@/types/profile'

// GET /api/profile — returns the authenticated user's own profile.
//
// 401 when the request has no Supabase session. RLS in the DB would also
// scope the read to the caller, but checking auth at the boundary lets us
// fail fast with a clear status code.
export async function GET(): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return errorResponse(401, 'Not authenticated.')

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return errorResponse(500, `Failed to load profile: ${error.message}`)
  if (!data) {
    // Shouldn't happen — the on-auth-user-created trigger inserts an empty
    // profile row on signup. But if it does, surface it as a clear 404 so
    // the client doesn't end up confused by an empty 200.
    return errorResponse(404, 'Profile not found for this user.')
  }

  return jsonResponse<Profile>(data as Profile)
}

// PATCH /api/profile — partial update of the authenticated user's profile.
//
// Body is validated with `ProfilePatchSchema` (strict, rejects unknown keys).
// RLS on `profiles` ensures the user can only update their own row even if
// this layer were bypassed.
export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return errorResponse(401, 'Not authenticated.')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'Body must be valid JSON.')
  }

  const parsed = ProfilePatchSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, 'Invalid profile payload.', {
      issues: parsed.error.flatten(),
    })
  }
  if (Object.keys(parsed.data).length === 0) {
    return errorResponse(400, 'Patch body cannot be empty.')
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle()

  if (error) return errorResponse(500, `Failed to update profile: ${error.message}`)
  if (!data) return errorResponse(404, 'Profile not found for this user.')

  return jsonResponse<Profile>(data as Profile)
}
