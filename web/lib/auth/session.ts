import type { User } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'

// Returns the authenticated Supabase user for the current request, or null
// when the visitor is anonymous. Reads the session cookie via the SSR
// client. Route handlers that require auth should call this and 401 when
// it returns null.
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return null
  }
  return data.user
}
