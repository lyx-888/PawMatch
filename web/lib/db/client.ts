import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Server-side Supabase client. Uses the service-role key — never import this
// from a Client Component. Public reads still go through here because the
// scrapers write with the service role and we want RLS off for v1 reads;
// RLS comes online when user-owned tables arrive in Phase 2.
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase env not configured: NEXT_PUBLIC_SUPABASE_URL and a key must be set.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
