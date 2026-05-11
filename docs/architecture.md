# Architecture

> Architectural decisions and rationale. Read on demand when working on cross-cutting changes. Day-to-day coding doesn't need this file.

---

## High-level shape

Two services share one Postgres database:

- **`web/`** — Next.js 14 App Router + TypeScript + Tailwind. User-facing PWA, admin UI, all client-facing API routes.
- **`scrapers/`** — Standalone Python service. Runs on a schedule, scrapes shelter sites, performs LLM extraction, writes to Postgres. No HTTP surface.

The web app and scrapers communicate **only through the database**. The web app must never call into scraper code; the scrapers must never call web app APIs.

## Data flow

```
Shelter websites
      ↓ (daily cron)
Python scrapers
      ↓ (upsert)
Postgres (Supabase)
      ↓ (read)
Next.js API routes
      ↓ (HTTP)
PWA frontend
```

## Match scoring architecture

Match scores are precomputed by Inngest jobs, never on-request. When a user's profile changes or a pet's data changes, a Postgres trigger writes a row to `recompute_queue`. An Inngest cron drains the queue every 30 seconds, fanning out to per-user/per-pet jobs. Reading match scores is always a database lookup.

This avoids Postgres → HTTP webhooks (Supabase doesn't natively support these without `pg_net` and adds failure modes), and keeps Inngest event volume bounded. See `docs/requirements/05-technical.md` §2.3.6 for the full strategy with bounding rules.

**Why precompute:** the swipe stack must feel instant. Computing scores per request adds 200ms+ per card on a profile of 300 pets and is wasteful since the same (user, pet) pair is read repeatedly.

**Anonymous users:** no server-side match scores. Tiers are computed client-side from the same algorithm with the localStorage profile as input. The TS algorithm is pure, no DB access; the Python implementation in scrapers is kept in sync via shared test fixtures.

## Anonymous users

Anonymous users are first-class. The app must work fully (swipe, favorite, filter, save profile drafts) before account creation. UUID stored in localStorage as the anonymous identity, all data client-side.

On account creation, migrate via `POST /api/auth/migrate`:
1. Client reads localStorage payload.
2. Server processes idempotently — if data already exists for this user, merge by union.
3. On success, localStorage cleared. On failure, preserved with retry banner.

**Cross-device limitation:** anonymous data is per-browser. A user who swipes on mobile and signs up on desktop loses their mobile favorites. Communicated at signup; acceptable v1 limitation.

## Server-side rendering

Server Components by default. Client Components only when interactivity demands it (swipe gestures, forms, filters). Pet listings, detail pages, and adoption stories are SSR for SEO and first-paint speed.

## Public share URLs

Public share pages (`/share/pet/:id`, `/share/search/:id`) must work without auth, without JS, without the service worker. Viewable on any device, including by people with the app blocked. They're a separate concern from the app surface — keep them lean and self-contained.

## Schema migration coordination

The shared database means schema changes must be backwards-compatible across one release. Detail in `CLAUDE.md`; runbook in `ops/migration-runbook.md`.

## Job queue (Inngest)

All background work runs through Inngest:
- `match_score.recompute_*` — DB-trigger-driven via `recompute_queue`.
- `notification.*` — scheduled and event-driven notifications.
- `picks.generate_daily` — daily Possibly Yours feed.
- `handoff.checkin` — daily cron.
- `activity.recompute` — daily pet activity stats.

**Scrapers do NOT run on Inngest.** They run on the dedicated Python service. Reason: scrapers benefit from a long-running process with persistent HTTP connections, and Inngest is event-driven serverless.

All Inngest jobs must be idempotent. Each logs completion to a metrics table. Dead-letter handling: jobs that fail after 3 retries are written to `failed_jobs`; admin reviews weekly.

**Cost ceiling:** v1 expected ~10K Inngest events/month, well under 50K free tier. Possibly Yours scales linearly with active users; at 20K+ active users we move to paid or batch generation.

## Tech stack rationale

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js 14 App Router | SSR, API routes, deployment simplicity, large ecosystem |
| Language (web) | TypeScript strict | Catches the bugs we'd ship without it |
| Styling | Tailwind | Fast iteration, no CSS file sprawl |
| Animation | framer-motion | Mature, handles swipe gestures cleanly |
| State management | Server Components + URL state + minimal client state | No Redux, no Zustand for v1 |
| Database | Supabase Postgres | Auth + DB + storage + RLS in one |
| Auth | Supabase Auth, magic link | No password reset flows |
| Job queue | Inngest free tier | Avoids reinventing retry/backoff |
| Scraping language | Python 3.11+ | Best HTML-parsing ecosystem |
| HTTP client (Python) | httpx | Async, modern |
| HTML parsing | selectolax | Faster than BeautifulSoup |
| Browser automation | playwright (only when JS-rendered required) | Fallback only |
| LLM | OpenAI gpt-4o-mini | Cheap, fast, structured outputs |
| Push notifications | Web Push API + service worker | No native required |
| Email | Resend | Modern API, generous free tier |
| Web hosting | Vercel | Tight Next.js integration |
| Scraper hosting | Fly.io ($5–10/mo) | Cron + Python = simple |
| Photo storage | Hotlinking in v1; Supabase Storage if cached later | v1 sidesteps storage entirely |
| Error tracking | Sentry free tier | Standard |
| Analytics | Plausible or PostHog | PDPA-friendly, no third-party PII |

## Environment story

| Environment | URL | DB | Notes |
|---|---|---|---|
| Local dev | localhost:3000 | Local Supabase via CLI (Docker) | Seed via `supabase/seed.sql` (synthetic, no production data ever copied locally) |
| Preview (PR) | `*.vercel.app` per PR | Dedicated `preview` Supabase project | Seeded weekly from synthetic dataset; no real user data |
| Production | TBD domain | Production Supabase project | Branch protection + manual approval gate |

**Why preview ≠ production data:** previews are exposed to anyone with the URL. Real user PII must never live there. Preview DB is reset weekly to a known seed.

Local dev requires Node 20+, Python 3.11+, Docker. Setup: `cp .env.example .env.local`, fill in keys, `supabase start`, `supabase db reset`, `npm run dev`.

## Secrets handling

- All secrets in env vars: Vercel for web, Fly.io for scrapers.
- `.env.example` lists every var with a comment, never values.
- Never commit `.env*` (other than `.env.example`).
- Rotate quarterly: OpenAI key, Supabase service role, Resend, Inngest signing key, VAPID keys.
- If a secret leaks: immediate rotation, audit access logs, document in `ops/incidents/`.

## `.env.example` template

Web app:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # web service role; never expose to client

# OpenAI
OPENAI_API_KEY=
LLM_DAILY_CAP_USD=2

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@pawmatch.sg

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@pawmatch.sg

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                   # for source map upload at build

# Analytics
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=        # OR NEXT_PUBLIC_POSTHOG_KEY

# Admin
ADMIN_IP_ALLOWLIST=                  # comma-separated CIDRs
ADMIN_AUTH_PASSWORD_HASH=            # bcrypt of admin password
```

Scrapers have their own `.env.example` with overlapping but distinct vars (Supabase service role, OpenAI key, scraper user agent).
