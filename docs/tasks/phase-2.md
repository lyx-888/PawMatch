# Phase 2 — Discovery & second open

> ~25 hours. See `README.md` for the full task index and working principles.

**Goal:** users have a profile, see smart match scores with named-pet reasoning, can take notes on favorites, compare them, and learn about adoption while browsing.

**Ship gate (measurable):**
- 5 testers complete the 3-question profile.
- 4 of 5 say match scores feel "smart" or "mostly smart" when shown 10 real pets.
- No tester reports a hard-fail miss (e.g., a pet that should be flagged HDB-ineligible but isn't).

### 2.1 Add SOSD and OSCAS scrapers

- [ ] Inspect each shelter's site, save fixtures.
- [ ] Implement `sources/sosd.py` and `sources/oscas.py`.
- [ ] Unit tests for each.
- [ ] Verify nightly run picks both up.
- **Acceptance:** all three scrapers running daily without errors for one week.

### 2.2 LLM extraction pipeline

- [ ] Add OpenAI API key to scraper env.
- [ ] `src/extraction.py` with `extract_attributes(description: str) -> ExtractionResult` using OpenAI gpt-4o-mini, structured outputs.
- [ ] Schema: per `requirements.md` §2.1.4 — fields with confidence scores.
- [ ] Add `extraction_cache` table; cache by `sha256(description + schema_version)`.
- [ ] Wire into `runner.py` post-upsert.
- [ ] Daily $2 USD spend cap at wrapper level.
- [ ] Mark `low_confidence_fields` array on pets.
- [ ] Unit tests with mocked OpenAI responses for known inputs.
- **Acceptance:** extraction runs after scrape; cache hit rate > 80% on second run; daily spend logged in `cost_log`.

### 2.3 User profile data model and API

- [ ] Migration: `users`, `profiles` tables per `requirements.md` §5.2.
- [ ] Migration: enable Supabase Auth.
- [ ] Migration: RLS policies — user can only read/write own profile.
- [ ] `/api/profile` GET (own only), PATCH (partial).
- [ ] Profiles can be partial; `completion_pct` auto-computed.
- **Acceptance:** authenticated user can read/update own profile; cannot read another user's profile.

### 2.4 Three-question onboarding

- [ ] After 5 swipes, show soft inline prompt.
- [ ] Three questions: housing, kids, other pets.
- [ ] On submit: save to localStorage (anon) or server (account).
- [ ] Match scores activate immediately.
- **Acceptance:** prompt appears at swipe #5, dismissable, completes in < 60 seconds.

### 2.5 Progressive profiling

- [ ] Define progressive question list with trigger conditions per `requirements.md` §2.2.
- [ ] Build trigger evaluation: each question has a `shouldTrigger(user, context)` predicate.
- [ ] Inline question card component, dismissable.
- [ ] Save answers; update `completion_pct`.
- **Acceptance:** triggers fire correctly per spec; users can dismiss without losing progress.

### 2.6 Match scoring

**Prerequisite:** before starting, confirm `requirements.md` §2.3.1.a–f sub-functions are stable. If any need adjustment based on Phase 2 testers, surface that change first via a docs PR.

- [ ] `lib/matching/score.ts`:
  - Input: profile, pet.
  - Output: `{ score, tier, reasons: Reason[] }`.
  - Hard fails per `requirements.md` §2.3.2.
  - Sub-functions per §2.3.1.a–f, each pure and unit-testable.
  - Weighted sum per §2.3.3 with `weights_version` constant.
- [ ] `lib/matching/reasons.ts` with named-pet templates per §2.3.5.
- [ ] `lib/matching/adore-breeds.ts` with the Project ADORE breed list per §2.3.1.g.
- [ ] `tests/matching-fixtures.json` shared between TS and Python implementations.
- [ ] Unit tests: 30 hand-crafted (pet, profile) pairs with expected outcomes from the fixtures file. **Required.**
- [ ] Migration: `match_scores` table per `requirements.md` §5.2.
- [ ] Migration: `recompute_queue` table.
- [ ] Postgres triggers on `profiles` and `pets` updates → insert into `recompute_queue`.
- [ ] Inngest cron `match_score.drain_queue` every 30 seconds: pull from `recompute_queue`, fan out to per-user/per-pet jobs.
- [ ] Inngest functions `match_score.recompute_user(user_id)` and `match_score.recompute_pet(pet_id)`.
- [ ] Nightly reconciliation cron `match_score.reconcile`: finds users with profile updates since last computed score, enqueues missed work.
- **Acceptance:** scores compute correctly for test cases; DB trigger fires; Inngest function completes; queue drains within 60s under normal load.

### 2.7 Match scoring in UI

- [ ] Swipe card displays tier badge (Great / Good / Stretch).
- [ ] Hard-fail pets shown dimmed with educational overlay, not hidden.
- [ ] 2 reason bullets max on card; full breakdown on detail.
- [ ] "Why am I seeing this?" link on detail expands to full explanation.
- [ ] Display "Complete profile for matches" if essentials not answered.
- **Acceptance:** UI matches spec; tier badges visually distinct; reasons specific not generic.

### 2.7.1 Anonymous user match scoring

- [ ] Port `lib/matching/score.ts` to a pure function with no DB access.
- [ ] On client side, when an anonymous user has localStorage profile, compute scores client-side from the same algorithm.
- [ ] Display tier badges identically to authenticated users.
- [ ] On account creation, delete client-side scores; server-side computation takes over.
- **Acceptance:** identical (pet, profile) inputs produce identical scores in TS client and TS server; the shared fixture file is the test oracle.

### 2.8 Personal notes on favorites

- [ ] Migration: add `note_text` to `favorites`.
- [ ] `PATCH /api/favorites/:pet_id` for note (≤ 500 chars, plain text).
- [ ] UI: textarea on favorites list and pet detail.
- [ ] Anonymous: notes saved to localStorage.
- **Acceptance:** notes persist; cap enforced; HTML sanitized.

### 2.9 Compare view

- [ ] `/favorites/compare` route.
- [ ] Selection mode on favorites list: pick 2–3.
- [ ] Side-by-side table: photo, size, age, energy, tier, key tags, source, status.
- [ ] Tap any pet to detail.
- **Acceptance:** comparison works for 2 and 3 pets; mobile-responsive.

### 2.10 Embedded readiness snippets

- [ ] Define content map per `requirements.md` §2.9.
- [ ] Track viewed snippets in user state (db or localStorage).
- [ ] Component: dismissable, expandable, non-blocking.
- [ ] "More on this" → `/learn` (placeholder full version, populated in Phase 5).
- **Acceptance:** correct snippets trigger at correct moments; never repeat.

### 2.11 "Possibly Yours" daily feed

- [ ] Migration: `daily_picks` table per `requirements.md` §5.2.
- [ ] Algorithm per `requirements.md` §2.4: 5 pets/day per active user, with mix rules.
- [ ] Define "active": user with at least one event (`pet_viewed`, `pet_favorited`, `swipe_5_complete`, login) in last 14 days.
- [ ] Daily Inngest cron `picks.generate_daily` at 06:00 SGT generates picks for all active users.
- [ ] UI section above main swipe stack on home, fetched from `daily_picks` for current date.
- **Acceptance:** distinct picks daily; rotation prevents same pet appearing in picks within 14 days; cost stays under 10K Inngest events/month.

### 2.12 i18n scaffolding

- [ ] `lib/i18n/` with `t()` function, JSON locale file `en.json`.
- [ ] **Migrate all hardcoded user-facing strings from Phase 1** to `t()` calls — this is a known one-time pass, not retroactive cleanup forever.
- [ ] All new code from this point uses `t()`.
- [ ] No actual translations in v1, but the structure is ready for v2.
- **Acceptance:** grep for hardcoded English strings in `app/` and `components/` returns nothing material; `en.json` covers all current strings.

### 2.13 Phase 2 ship gate

- [ ] Deploy.
- [ ] Recruit 5 testers (mix of HDB and condo, with and without kids).
- [ ] Each completes the 3-question profile.
- [ ] Show each 10 real pets covering a range of tiers.
- [ ] **Exit criteria:**
  - 4 of 5 testers describe scores as "smart" or "mostly smart."
  - No tester finds a pet that should be hard-fail but isn't.
  - No tester is shown a Great match that they themselves consider Stretch or worse.
- [ ] Fix any consistent disagreements with the algorithm before proceeding.

---

