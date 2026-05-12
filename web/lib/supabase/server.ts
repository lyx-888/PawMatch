import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Server-side Supabase client that reads/writes auth cookies via Next's
// `cookies()` API. Used in Server Components and Route Handlers where the
// request context is implicit. RLS applies — this client identifies the user
// from their session cookie and only sees rows the user is allowed to see.
//
// Do NOT use this for write-anywhere bookkeeping (admin or scraper work);
// for that, use `createServiceRoleClient` from `lib/db/client.ts`.
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.')
  }
  const cookieStore = await cookies()
  return createSSRClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(toSet: CookieToSet[]) {
        // Route Handlers and Server Actions can write cookies; Server
        // Components cannot. Suppressing the throw means Server Components
        // still work — the middleware refresh handles cookie updates in
        // that path.
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // No-op: read-only context (Server Component render).
        }
      },
    },
  })
}
