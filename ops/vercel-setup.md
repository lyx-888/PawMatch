# Vercel setup runbook — task 0.5

> One-time setup. Re-read if onboarding a second deploy environment.

## Importing the project

1. Push the repo to GitHub if you haven't already.
2. Go to https://vercel.com/new → **Import Git Repository** → select `pawmatch`.
3. **Configure project:**
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `web` ← **important**, the Next.js app lives in a subdirectory
   - Build/output settings: leave defaults
4. **Environment variables** — add these before the first deploy:

   | Key | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://pzyixlsmjqzgmtfivjad.supabase.co` | Public — safe in `NEXT_PUBLIC_*` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | The publishable key from Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | The secret key. **Never** prefix with `NEXT_PUBLIC_` |

   Defer the rest (`ANTHROPIC_API_KEY`, `INNGEST_*`, `RESEND_API_KEY`, `VAPID_*`, `SENTRY_DSN`) until Phase 2/3 when those services are wired up.

5. Click **Deploy**. First build takes 1–2 min.
6. **Acceptance:** the deployed URL serves the default Next.js page over HTTPS. Take note of the production URL — point UptimeRobot at it later.

## Branch deploys

- `main` → production
- Every PR → preview deployment (auto, free tier supports this)

## Fly.io for scrapers (later)

Defer until **Phase 1 task 1.3** when the first SPCA scraper exists. At that point:
1. Sign up at https://fly.io
2. `fly launch` from `scrapers/` (no build step needed — Python runs in a container)
3. Set scheduled run via Fly Machines + cron, OR via Inngest from web/ (decide in Phase 1)

For Phase 0, just create the Fly account and verify you can sign in. No deploy yet.

## Rollback

Vercel keeps every deployment. From the project dashboard → Deployments → click any prior deployment → **Promote to Production**. One-click rollback. Document this in [incident-response.md](incident-response.md) when that runbook is fleshed out.
