# 05 — Technical requirements

> Section 5 of the requirements. See `README.md` for the full index.
>
> The data model SQL is extracted into `data-model.sql` for direct copy-paste into migrations. The text version is preserved here for narrative reading.

## 5. Technical requirements

### 5.1 Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 14 App Router, TypeScript strict, Tailwind, framer-motion | SSR, API routes, mature ecosystem |
| Database | Supabase Postgres (region: ap-southeast-1) | Auth + DB + storage + RLS |
| Auth | Supabase Auth, magic link | No password reset flows |
| Scrapers | Python 3.11+, httpx, selectolax, playwright (only when needed) | Best HTML-parsing ecosystem |
| LLM | Claude Haiku via Anthropic API, structured outputs | Cheap, fast, JSON schema |
| Job queue | Inngest (free tier) | Avoids reinventing retry/backoff |
| Push | Web Push API + service worker | No native required |
| Email | Resend | Modern API, free tier |
| Hosting (web) | Vercel | Tight Next.js integration |
| Hosting (scrapers) | Fly.io ($5–10/mo) | Cron-friendly |
| Storage | Supabase Storage | Minimal v1 use |
| Error tracking | Sentry (free tier) | Standard |
| Analytics | Plausible or PostHog | PDPA-friendly, no PII to third parties |

### 5.2 Data model

```sql
-- Reference data
shelters (
  id text primary key,
  name text not null,
  website text not null,
  contact_email text,
  verified_since date,
  blurb text,
  logo_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Listings
pets (
  id uuid primary key default gen_random_uuid(),
  source text not null references shelters(id),
  source_id text not null,
  source_url text not null,
  name text not null,
  species text not null,
  breed text,
  sex text,
  age_months int check (age_months >= 0 and age_months < 600),
  size text check (size in ('small', 'medium', 'large')),
  weight_kg numeric(5,2),
  height_cm numeric(5,2),
  hdb_approved boolean,
  description text,
  photo_urls text[] default '{}',                     -- index 0 is primary
  tags text[] default '{}',
  status text not null default 'available'
    check (status in ('available', 'pending', 'adopted', 'gone')),
  status_reason text,
  low_confidence_fields text[] default '{}',
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  scraped_at timestamptz default now(),
  unique (source, source_id)
);
create index pets_status_idx on pets(status);
create index pets_species_size_idx on pets(species, size);
create index pets_first_seen_idx on pets(first_seen_at desc);
create index pets_tags_gin on pets using gin(tags);

pet_status_history (
  id bigserial primary key,
  pet_id uuid references pets(id) on delete cascade,
  status text not null,
  reason text,
  changed_at timestamptz default now()
);

-- Users
users (
  id uuid primary key,
  email text unique,
  created_at timestamptz default now(),
  account_status text default 'registered',
  push_subscription jsonb,
  ios_pwa_installed boolean default false,
  is_admin boolean default false,
  deleted_at timestamptz                              -- set on deletion request; full purge job runs on this
);

profiles (
  user_id uuid primary key references users(id) on delete cascade,
  housing_type text,
  hdb_block_type text,
  mesh_status text,
  has_kids boolean,
  kid_ages int[] default '{}',
  other_pets text,
  work_pattern text,
  hours_alone int,
  experience text,
  activity_level text,
  budget_tier text,
  special_needs_ok boolean,
  species_pref text[],
  completion_pct int default 0 check (completion_pct between 0 and 100),
  updated_at timestamptz default now(),
  check (has_kids = true or kid_ages = '{}')
);

-- Engagement
saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  filters_json jsonb not null,
  tier_threshold text default 'good'
    check (tier_threshold in ('great', 'good', 'stretch')),
  notify boolean default true,                        -- master on/off; threshold filters which alerts fire
  last_match_at timestamptz,
  created_at timestamptz default now()
);

followed_shelters (
  user_id uuid references users(id) on delete cascade,
  shelter_id text references shelters(id),
  created_at timestamptz default now(),
  primary key (user_id, shelter_id)
);

favorites (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  created_at timestamptz default now(),
  status_when_favorited text,
  note_text text check (length(note_text) <= 500),
  primary key (user_id, pet_id)
);

passes (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, pet_id)
);

-- Matching
match_scores (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  score int not null check (score between 0 and 100),
  tier text not null check (tier in ('great', 'good', 'stretch', 'hard_fail')),
  reasons_json jsonb not null,
  weights_version int not null,
  stale boolean default false,
  computed_at timestamptz default now(),
  primary key (user_id, pet_id)
);
create index match_scores_user_tier_idx on match_scores(user_id, tier, score desc) where stale = false;

recompute_queue (
  id bigserial primary key,
  kind text not null check (kind in ('user', 'pet', 'all')),
  target_id uuid,                                     -- user_id or pet_id depending on kind
  enqueued_at timestamptz default now(),
  picked_up_at timestamptz
);
create index recompute_queue_pending_idx on recompute_queue(enqueued_at) where picked_up_at is null;

daily_picks (
  user_id uuid references users(id) on delete cascade,
  date date not null,
  pet_ids uuid[] not null,
  generated_at timestamptz default now(),
  primary key (user_id, date)
);

-- Notifications
notifications (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  type text not null,
  pet_id uuid references pets(id) on delete set null,
  channel text not null,
  payload jsonb,
  sent_at timestamptz default now(),
  delivered_at timestamptz,                           -- distinct from sent_at: confirmed delivery
  opened_at timestamptz,                              -- email opens or push interaction
  clicked_at timestamptz                              -- click on a link in the notification
);
create index notifications_user_idx on notifications(user_id, sent_at desc);

-- Stories
adoption_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  pet_id uuid references pets(id) on delete set null,
  source_type text not null
    check (source_type in ('user_submitted', 'shelter_sourced', 'curated')),
  shelter_id text references shelters(id),
  new_name text,
  photo_url text,
  text text,
  status text not null
    check (status in ('pending', 'approved', 'rejected', 'flagged')),
  flag_count int default 0,
  created_at timestamptz default now(),
  approved_at timestamptz
);
-- Note: status default depends on source_type; enforce in application code or trigger:
-- user_submitted → 'pending'; shelter_sourced and curated → 'approved'.

-- Handoff
handoff_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  tapped_through_at timestamptz default now(),
  checkin_response text
    check (checkin_response in ('got_response', 'no_response', 'changed_mind') or checkin_response is null),
  checkin_at timestamptz
);

-- Activity (cached; refreshed daily)
pet_activity (
  pet_id uuid primary key references pets(id) on delete cascade,
  favorites_last_7d int default 0,
  passes_last_7d int default 0,
  views_last_7d int default 0,
  computed_at timestamptz default now()
);

-- Operational
weekly_digests (
  user_id uuid references users(id) on delete cascade,
  week_starting date,
  sent_at timestamptz,
  opened boolean default false,
  clicked boolean default false,
  primary key (user_id, week_starting)
);

extraction_cache (
  description_hash text primary key,                  -- sha256(description) — same hash hits across pets/sources, intentional
  schema_version int not null,
  result jsonb not null,
  confidence jsonb,
  created_at timestamptz default now()
);

scraper_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('running', 'success', 'failed')),
  pets_found int,
  pets_added int,
  pets_updated int,
  pets_marked_gone int,
  error_message text
);

cost_log (
  date date primary key,
  llm_calls int default 0,
  llm_cost_usd numeric(10,4) default 0,
  vercel_bandwidth_gb numeric(10,2),
  supabase_db_size_mb numeric(10,2),
  inngest_events int default 0
);
```

#### 5.2.1 Database role boundaries

Three Postgres roles:

| Role | Used by | Allowed writes |
|---|---|---|
| `anon` | Public unauthenticated requests via Supabase | None except via specific RPC functions |
| `authenticated` | Logged-in users | Their own rows in `profiles`, `favorites`, `passes`, `saved_searches`, `followed_shelters`, `notifications` (read only), `handoff_events`, `adoption_stories` (insert pending); enforced via RLS |
| `service_scraper` | Python scraper service | `pets`, `pet_status_history`, `scraper_runs`, `extraction_cache`, `cost_log`, `pet_activity`. **Deny** on user-data tables |
| `service_web` | Next.js API routes (server actions) | All user-data tables; can read `pets`, `match_scores`, etc. **Deny** on `scraper_runs`, `extraction_cache` writes |
| `service_jobs` | Inngest job runners | `match_scores`, `recompute_queue`, `daily_picks`, `notifications`, `pet_activity`, `weekly_digests` |

Service roles bypass RLS but each is constrained by GRANT/REVOKE on table writes. Documented in `supabase/migrations/000_roles.sql`.

### 5.3 API endpoints

#### Public (no auth)
```
GET  /api/pets                    Paginated list with filters
GET  /api/pets/:id                Single pet
GET  /api/sources                 Shelters with metadata
GET  /api/share/pet/:id           Public read-only pet
GET  /api/share/search/:id        Public read-only saved search
GET  /api/stories                 Public adoption stories
GET  /api/health                  Health check
```

#### Authenticated
```
POST   /api/auth/magic-link       Request magic link
POST   /api/auth/migrate          One-time anon → user migration
DELETE /api/auth/account          Account deletion

GET    /api/profile               Current user's profile
PATCH  /api/profile               Update (partial)

POST   /api/favorites             Add favorite
DELETE /api/favorites/:pet_id     Remove
PATCH  /api/favorites/:pet_id     Update note
GET    /api/favorites             List

POST   /api/passes                Add pass
GET    /api/passes                List

POST   /api/saved-searches        Create
GET    /api/saved-searches        List
PATCH  /api/saved-searches/:id    Update
DELETE /api/saved-searches/:id    Remove

POST   /api/followed-shelters/:id   Follow
DELETE /api/followed-shelters/:id   Unfollow

GET    /api/match-scores/:pet_id  Score + reasons for current user

POST   /api/handoff               Log tap-through
PATCH  /api/handoff/:id           Submit check-in response

POST   /api/push/subscribe        Save push subscription
DELETE /api/push/subscribe        Remove

POST   /api/stories               Submit (v1.5)
POST   /api/stories/:id/flag      Flag story
```

#### Admin (auth + role check)
```
GET    /api/admin/pets, PATCH /api/admin/pets/:id
GET    /api/admin/extractions
GET    /api/admin/scrapers
GET    /api/admin/notifications
GET    /api/admin/costs
GET    /api/admin/users, DELETE /api/admin/users/:id
GET    /api/admin/stories, PATCH /api/admin/stories/:id
```

### 5.4 Performance targets

- Home FCP: < 1.5s on 4G.
- Swipe card transition: 60fps.
- Filter change → result: < 200ms cached / < 500ms cold.
- API p95: < 300ms reads, < 500ms writes.
- Match score lookup: < 50ms (precomputed).
- Service worker caches last 50 swiped pets for offline.

### 5.5 Job queue

**Choice: Inngest** — managed serverless queue, free tier covers v1, integrates with Next.js.

Background jobs:
- `scrape.run` — daily cron (lives in Python service, not Inngest).
- `match_score.recompute_user`, `match_score.recompute_pet` — triggered by DB triggers.
- `notification.dispatch` — every 15 min.
- `notification.first_week_check` — daily.
- `notification.weekly_pulse` — Sunday 9am.
- `notification.quiet_failure_check` — weekly.
- `handoff.checkin` — daily.

All jobs idempotent. Each logs completion to a metrics table.

### 5.6 Reliability

- Each scraper isolated.
- Failures logged to `scraper_runs`. Admin emailed when count drops > 50% vs prior run.
- Last-known-good data continues serving on scrape failure.
- Match-score worker down → fall back to recency sort; banner shown if any score > 24h stale.
- **Inngest down:** notifications queue in `notifications` rows with `sent_at IS NULL`; on Inngest recovery, cron drains the backlog (max 100 sends per minute to avoid push provider throttling). If Inngest is down > 24h, Weekly Pulse is skipped that week (better to miss than batch-send a stale digest).
- **Dead-letter handling:** Inngest jobs that fail after 3 retries have their event written to a `failed_jobs` log; admin reviews weekly. Match-score recompute failures fall back to the nightly full-reconciliation cron.

#### 5.6.1 Backup and disaster recovery

- **RPO** (max data loss): 24h. Daily Postgres dump to off-Supabase storage (Cloudflare R2).
- **RTO** (max downtime): 4h.
- **Recovery procedure** in `ops/disaster-recovery.md`:
  1. Provision new Supabase project.
  2. Restore latest dump.
  3. Update Vercel env vars.
  4. Re-deploy scrapers with new DB target.
  5. Verify with smoke tests.
- Restore tested quarterly.

#### 5.6.2 Schema migration coordination

The web app and scrapers share a database. Schema changes require:

1. Migration designed to be backwards-compatible for one release (additive only — no drops or renames in same migration as code requiring them).
2. Migration applied first.
3. Scrapers deployed (read/write the new schema).
4. Web app deployed.
5. In a follow-up migration, drop old columns/tables once both services confirmed working.

For breaking changes that can't be split: schedule a coordinated outage window, document in `ops/migration-runbook.md`.

### 5.7 Privacy and PDPA

- All lifestyle data per-user only. Never shared with shelters except via explicit user-initiated prefilled message.
- Privacy policy linked in onboarding, footer, every account-creation step.
- `DELETE /api/auth/account` removes PII within 24h:
  - `users` row deleted (cascades to profiles, favorites, passes, saved_searches, etc.).
  - Notifications anonymized (user_id null, kept for aggregate metrics).
  - Handoff events anonymized.
  - Adoption stories anonymized but retained (with user consent at story creation).
- Self-hosted analytics; no third-party PII sharing.
- No tracking pixels in emails.
- Anonymous users: no PII collected. UUID is local-only.
- Cookies: only session and CSRF. Cookie banner if any analytics added.
- Data export on request: manual process v1, automatable later.

### 5.8 Security

- All API routes validated with Zod.
- Auth via Supabase, JWT in HTTP-only cookie.
- CSRF protection on state-changing endpoints (Next.js middleware).
- Rate limits per §2.14.
- Magic link single-use, 15-min expiry, invalidates on use.
- Sessions: 30-day sliding expiry, revocable from `/profile`.
- Admin route: separate role check + IP allowlist for v1.
- Secrets in Vercel/Fly env vars, rotated quarterly.
- Sentry PII scrubbing (no email, no IP, no plain user_id).
- HTTPS only, HSTS preload, secure cookies.
- CSP: strict, no inline scripts, allowlist for shelter image domains.

### 5.9 PWA and platform reality

- iOS Safari: Web Push requires home-screen install (16.4+). Surface walkthrough at notification opt-in.
- Android Chrome: Web Push works without install.
- Desktop: works without install.
- Offline: service worker caches last 50 swiped pets and home shell.
- Install prompts respect user choice; no nagging.
- Manifest.json with icons, splash, theme color.

### 5.10 Internationalization

- v1: English only. ~75%+ of SG residents fluent in English; deferring translation accelerates v1.
- v2: add Mandarin first, then Malay and Tamil based on usage signals.
- Code prepared from day 1: all user-facing strings via `t()` function, even with only `en.json`.

### 5.11 Observability

- **Errors:** Sentry with PII scrubbing.
- **Events:** structured to PostHog/Plausible:
  - `pet_viewed`, `pet_favorited`, `pet_passed`, `pet_shared`.
  - `swipe_session_started`, `swipe_5_complete`.
  - `profile_essentials_complete`, `profile_question_answered`.
  - `account_created`, `magic_link_requested`.
  - `saved_search_created`, `notification_received`, `notification_clicked`.
  - `handoff_clicked`, `checkin_completed`.
- **Health:** `/api/health` returns DB, scraper last-run, LLM availability.
- **Uptime:** UptimeRobot free tier on `/api/health`.
- **Dashboards:** §1.6 metrics in admin.

### 5.12 Cost ceiling and monitoring

| Resource | Free tier | v1 expected | Action if exceeded |
|---|---|---|---|
| Vercel | 100GB bw/mo | 5–20GB | Pro ($20/mo) |
| Supabase | 500MB DB, 2GB bw | < 100MB DB | Pro ($25/mo) |
| Anthropic | Pay-as-you-go | $5–10/mo | Daily cap enforced |
| Fly.io | $5/mo for shared CPU | $5/mo | n/a |
| Resend | 3K emails/mo | < 1K | Paid |
| Inngest | 50K events/mo | < 10K | Paid |
| Sentry | 5K errors/mo | < 500 | Paid |

Total expected v1: **$5–15/month**. Hard ceiling: $40/mo before discussion.

Daily cron fetches usage from each service, writes to `cost_log`. Admin alerts (email) at 80% of any free-tier limit.

### 5.13 Accessibility

- All interactive elements keyboard-navigable.
- Swipe actions have button equivalents.
- Real alt text on photos (LLM-generated if not in source).
- WCAG AA color contrast.
- Reduced-motion: replace swipe animations with fade.
- Screen reader testing on home, swipe, detail, share before each phase ship.
- **Built in from Phase 1, not retrofitted in Phase 5.** Phase 5 is the polish pass; basic a11y hygiene (semantic HTML, focus management, button alternatives) lives in every phase from the start.

### 5.14 Support and feedback

- **User support:** `support@pawmatch.sg` mailbox routes to project owner inbox. Response SLA: 72h for v1 (best-effort, not contractual).
- **Shelter feedback:** dedicated form on `/about` and direct email `shelters@pawmatch.sg`. Response SLA: 24h for shelter requests, especially removal requests.
- **Bug reports:** in-app "Send feedback" link in `/profile` posts to a `feedback` Postgres table; admin review weekly.
- **Abuse reporting:** `abuse@pawmatch.sg` for content concerns; in-app flag button on adoption stories (v1.5).
- **Public status page:** none in v1. If outages become regular, set up a simple status page in v1.5.

### 5.15 Roles and process (solo or team)

This project is built primarily by one person. If others contribute:

- **Owner** has final say on product direction, architectural changes, shelter relationships.
- **Contributors** open PRs against `main`, follow `CLAUDE.md`, get review by owner before merge.
- **Open source decision** (open question §8) determines whether external contributions are accepted.
- **Code review:** self-review on solo PRs is acceptable but the owner uses a checklist (`ops/pr-review-checklist.md`) covering: tests added, docs updated, schema migration safe, no PII logged, no hardcoded secrets, cost impact understood.

---

