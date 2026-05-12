import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

// Next.js convention: top-level `middleware.ts` runs before every matched
// request. Our only job here is to refresh the Supabase session cookie so
// authenticated reads on the server don't see a stale token.

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Skip static assets, image optimization, favicon, and the service worker
  // — those don't need a session and the cookie writes cost real work.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw\\.js).*)'],
}
