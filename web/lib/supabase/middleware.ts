import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Runs on every request to keep the Supabase session fresh. The SSR helper
// reads cookies off the request, may issue refreshed tokens via setAll, and
// we propagate those back onto the response so the client picks them up.
//
// Returning the response object lets the route-level `middleware.ts` return
// it directly; downstream Next handlers see the refreshed cookies on the
// request side too.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Without auth env vars the rest of the middleware is a no-op. The page
    // render will still happen; just no session refresh.
    return response
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(toSet: CookieToSet[]) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value)
        }
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Touching getUser() refreshes the token if needed — that's the whole
  // point of this middleware. We don't act on the user object itself here.
  await supabase.auth.getUser()
  return response
}
