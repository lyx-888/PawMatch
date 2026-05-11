# Phase 1 — Foundation & first-session win

> ~25 hours. See `README.md` for the full task index and working principles.

**Goal:** a stranger can land on the deployed app and have a satisfying first session — anonymous swipe through real SG shelter pets, with photos, key facts, and basic filtering.

**Ship gate (measurable):**
- 3 friends complete ≥5 swipes without verbal coaching from you.
- At least one of them taps "View on shelter" of their own volition.
- No more than 2 unique confusions surface that aren't trivial.

**Risk note:** the entire plan depends on at least one shelter site being scrapable. Task 1.3 must be done first and validated before committing to the rest of the phase.

### 1.1 Database schema (foundational tables)

- [ ] Migration 001: `shelters` table seeded with the 9 SG shelters (manual SQL insert).
- [ ] Migration 002: `pets` table per `requirements.md` §5.2, with indexes.
- [ ] Migration 003: `pet_status_history` with trigger to log status changes.
- [ ] Migration 004: `scraper_runs` table for health tracking.
- [ ] Migration 005: `cost_log` table.
- **Acceptance:** migrations apply cleanly to a fresh Supabase instance.

### 1.2 Scraper base infrastructure

- [ ] Create `src/base.py` with `PetRecord` Pydantic model.
- [ ] Create shared `httpx` client: user agent ("PawMatchSG/0.1; contact@pawmatch.sg"), 30s timeout, 3 retries with exponential backoff, max 1 req/sec per source.
- [ ] Create `src/db.py` with Supabase client and `upsert_pet()`, `mark_gone()`, `record_run()`.
- [ ] Create `src/runner.py` skeleton: orchestrates scrapers, calls each, upserts, marks missing pets `gone` after grace period.
- **Acceptance:** unit tests for `base.py` and `db.py` pass; `runner.py` callable but does nothing useful yet.

### 1.3 Scraper validation (CRITICAL FIRST CHECK)

- [ ] Manually inspect SPCA's adoption gallery. Is it static HTML? JS-rendered? Behind a bot wall (Cloudflare challenge, etc.)?
- [ ] Check `robots.txt` — does it disallow our paths?
- [ ] Save a sample listing page as fixture in `tests/fixtures/spca/`.
- [ ] Write a minimal parser that extracts at least: name, photo URL, source URL.
- [ ] Test against the fixture. **Verify it works.**
- [ ] Run once against live SPCA. **Verify it works without being blocked.**
- **Acceptance:** can pull at least 5 real pets from SPCA into Supabase without errors or 403/429s.
- **If this fails:** stop and reassess. The honest options are:
  - Try a different shelter as the validation source (SOSD next).
  - Reach out to a shelter for explicit permission and an API/CSV feed.
  - Acknowledge that the entire premise of the project may be unworkable as conceived.
  - **None of these are in-phase pivots.** They're project-level decisions. Don't paper over a failure here by switching plans mid-phase.

### 1.4 First scraper end-to-end (SPCA)

- [ ] Expand `src/sources/spca.py` to extract all fields per `PetRecord`.
- [ ] Add unit test parsing the fixture, asserting expected fields.
- [ ] Run scraper locally; verify data lands in Supabase with all fields populated.
- [ ] Confirm photo URLs render in a browser (open one directly).
- **Acceptance:** SPCA scraper imports ≥10 pets with name, photo, description, source URL all correct.

### 1.5 Scheduling

- [ ] Deploy scraper service to Hetzner/Fly.io.
- [ ] Configure cron: `python -m src.runner` daily at 03:00 SGT.
- [ ] Set up logging: write structured logs to a file or service.
- [ ] Manually trigger one run; confirm Supabase has fresh data.
- **Acceptance:** automated run completes overnight; `scraper_runs` row created with success status.

### 1.6 Pet API (read-only)

- [ ] `GET /api/pets` with Zod validation on query params: `species`, `size`, `source`, `hdb_approved`, `tags[]`, `listed_since`, `cursor`, `limit`.
- [ ] `GET /api/pets/:id` for single pet.
- [ ] `GET /api/sources` returns shelters with last-scraped time and current pet count.
- [ ] `GET /api/health` returns status of DB and last scraper run.
- [ ] Add unit tests for filter logic.
- **Acceptance:** all endpoints return correct data; filter combinations work; invalid params return 400 with helpful messages.

### 1.7 Anonymous identity

- [ ] On first visit, generate UUID, store in `localStorage` as `pawmatch_anonymous_id`.
- [ ] Create `lib/identity.ts`: `getAnonymousId()`, `useAnonymousId()` hook.
- [ ] No server roundtrip — purely client-side until auth.
- **Acceptance:** opening the app in a fresh incognito window assigns a UUID that persists across reloads.

### 1.8 Local state

- [ ] `lib/local-state.ts` for favorites, passes, profile drafts in localStorage.
- [ ] Functions: `addFavorite`, `removeFavorite`, `getFavorites`, `addPass`, `getPasses`, `getExcludeIds`.
- [ ] Caps per `requirements.md` §2.14: 200 favorites, 1000 passes (FIFO eviction), warning at 80%.
- [ ] React hooks: `useFavorites()`, `usePasses()`.
- **Acceptance:** unit tests cover idempotency, eviction, cap behavior.

### 1.9 Swipe stack UI

- [ ] Install framer-motion.
- [ ] `components/swipe/SwipeCard.tsx`: photo carousel, name, key facts, source badge.
- [ ] `components/swipe/SwipeStack.tsx`: stack of cards, swipe gestures, tap support.
- [ ] Photo carousel within card supports tap-zones to cycle.
- [ ] Swipe right → favorites; swipe left → passes (localStorage).
- [ ] Buttons below the card mirror swipe actions.
- [ ] Reduced-motion respected (fade instead of slide).
- **Acceptance:** swipe gestures work on mobile and desktop; both keyboard and touch users can advance the stack.

### 1.10 Home page

- [ ] `/` route: header (live counter), swipe stack as main element.
- [ ] Live counter from `/api/sources`: total pets + last-scraped time.
- [ ] Excludes already-passed/favorited pets from the stack.
- [ ] Stack-empty state: friendly message with CTA to widen filters.
- **Acceptance:** loads in < 2s on simulated 4G; counter accurate; stack respects exclusions.

### 1.11 Pet detail page

- [ ] `/pets/[id]` server-rendered.
- [ ] Full photo carousel.
- [ ] All listed attributes.
- [ ] Last-updated timestamp; "verify on shelter site" badge if > 48h old.
- [ ] Status badge (available/pending/adopted/gone).
- [ ] **View on [Shelter]** primary CTA (target=_blank, rel=noopener).
- [ ] Save / Pass / Share buttons (Share uses Web Share API with fallback to copy URL).
- **Acceptance:** every field from the DB displays correctly; CTA opens shelter page.

### 1.12 Basic filters

- [ ] `/search` route with form: species, size, age range, source shelter (multi-select).
- [ ] Live result count, debounced 300ms.
- [ ] Results in grid view (not swipe).
- [ ] Empty state per `requirements.md` §2.6.1.
- **Acceptance:** filter changes update count and results; URL reflects filter state for shareable links.

### 1.13 Favorites page

- [ ] `/favorites` shows favorited pets from localStorage.
- [ ] Each card shows current status (cross-referenced with API).
- [ ] Tap to detail.
- **Acceptance:** favorites persist across reloads; status badges accurate.

### 1.14 PWA basics

- [ ] `manifest.json` with name, icons, theme color.
- [ ] Basic service worker for offline cache of last-loaded pets.
- [ ] iOS install meta tags.
- [ ] "Add to Home Screen" works on Android Chrome and iOS Safari.
- **Acceptance:** Lighthouse PWA score > 80.

### 1.15 Foundational accessibility

- [ ] Semantic HTML throughout (use `<button>`, `<nav>`, `<main>`, `<article>` correctly).
- [ ] All images have `alt` attribute (placeholder text acceptable; LLM-generated alt comes in Phase 2).
- [ ] Keyboard-only walkthrough of the swipe → favorite → detail → back flow works.
- [ ] Focus indicators visible (Tailwind `focus-visible:` utilities, not removed).
- [ ] Color contrast WCAG AA on home, swipe, detail.
- **Acceptance:** keyboard-only tester completes all Phase 1 user flows; Lighthouse Accessibility > 85.

### 1.16 Analytics events for Phase 1 metrics

- [ ] Set up Plausible or PostHog client.
- [ ] Implement events needed for Phase 1 success metrics (`requirements.md` §1.6 + §5.11):
  - `pet_viewed`, `pet_favorited`, `pet_passed`, `pet_shared`.
  - `swipe_session_started`, `swipe_5_complete`.
  - `handoff_clicked`.
- [ ] Verify events appear in dashboard.
- **Acceptance:** all listed events fire correctly; no PII included; dashboard shows live data.

### 1.17 Phase 1 ship gate

- [ ] Deploy to production.
- [ ] Walk through full anonymous flow on a real phone.
- [ ] Recruit 3 friends. Watch them use it. Note every confusion.
- [ ] **Exit criteria:**
  - All 3 complete ≥5 swipes without verbal coaching.
  - At least 1 taps "View on shelter" unprompted.
  - No more than 2 unique confusions identified.
  - Analytics confirm at least one `swipe_5_complete` and one `handoff_clicked` event from a real friend session.
- [ ] If exit criteria not met: fix the top issues; do not proceed to Phase 2 with critical confusions outstanding.

---

