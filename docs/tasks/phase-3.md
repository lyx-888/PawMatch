# Phase 3 — The watch

> ~25 hours. See `README.md` for the full task index and working principles.

**Goal:** the app keeps watching for users in the background. Saved searches, push notifications, status alerts, and the weekly pulse turn the app into a long-term companion.

**Ship gate (measurable):**
- A new account from signup-to-first-notification reliably fires within 7 days.
- Weekly Pulse delivers to a test list of 10 with > 50% open rate.
- One tester receives a real match notification in production and clicks through.

### 3.1 Auth (magic link)

- [ ] Configure Supabase Auth with magic link.
- [ ] `/auth/sign-in` page.
- [ ] `POST /api/auth/magic-link` with rate limit per `requirements.md` §2.14.
- [ ] `/auth/callback` handler.
- [ ] Account creation triggered only by persistence actions per §2.2.
- [ ] Migration handler at callback per §2.2.1 — idempotent, preserves data on failure.
- **Acceptance:** anonymous user with localStorage state can create account and have all data migrated cleanly.

### 3.2 Saved searches

- [ ] Migration: `saved_searches` table.
- [ ] Full CRUD: `POST/GET/PATCH/DELETE /api/saved-searches`.
- [ ] Save-search button on `/search`.
- [ ] Custom name input.
- [ ] Tier threshold setting (default Great + Good).
- [ ] `/saved-searches` page.
- **Acceptance:** users can create, edit, delete searches; rate limits enforced.

### 3.3 Followed shelters

- [ ] Migration: `followed_shelters` table.
- [ ] Follow/unfollow endpoints.
- [ ] Follow button on pet cards and Sources page.
- **Acceptance:** following persists; notifications target followed shelters in §3.5.

### 3.4 Web push setup

- [ ] Generate VAPID keys, add to env.
- [ ] Service worker registers for push.
- [ ] `POST /api/push/subscribe` stores subscription.
- [ ] In-app banner explaining notifications, prompted at correct moment (after first save-search, not on first load).
- [ ] iOS: detect Safari without home-screen install; show install walkthrough first.
- **Acceptance:** Android Chrome user can subscribe and receive a test push; iOS user is shown install walkthrough.

### 3.5 Notification engine

- [ ] Migration: `notifications` table per `requirements.md` §5.2.
- [ ] Inngest function `notification.dispatch` runs every 15 min:
  - For each saved search where `notify=true`, find new pets matching above `tier_threshold` since `last_match_at`.
  - **Backfill behavior on new saved search:** when `last_match_at IS NULL`, set it to `now()` at the moment of search creation — do NOT batch-send all currently-matching pets (overwhelming first impression). The first match notification will be the next pet that arrives or recomputes.
  - For each followed shelter, check new arrivals.
  - For favorited pets, check status changes.
  - Send push and/or email per user prefs.
  - Respect quiet hours (10pm–8am SGT).
  - Cap at default 1/week unless toggled.
  - Record sent in `notifications`.
- [ ] Inngest function `notification.first_week_check` runs every 6h: identifies users approaching day 7 with zero notifications, sends per fallback chain in §2.7.5.
- [ ] Email templates in Resend.
- **Acceptance:** unit tests for cap logic, quiet hours, backfill behavior, fallback chain; integration test for end-to-end notification fire.

### 3.6 Weekly Pulse

- [ ] Inngest function `notification.weekly_pulse` Sunday 9am SGT.
- [ ] Email template (Resend) and push variant.
- [ ] Content: top 5 new pets, weekly adoption count, longest-waiting pet, one story.
- [ ] Migration: `weekly_digests` table for tracking opens/clicks.
- **Acceptance:** test send to a 10-person list; > 50% open rate; click-through tracked.

### 3.7 Quiet-failure check-in

- [ ] Inngest function `notification.quiet_failure_check` weekly.
- [ ] Identifies saved searches with 0 matches for 4+ weeks.
- [ ] Sends check-in: *"Quiet month — only N pets matched. Want to widen?"*
- **Acceptance:** check-in fires for stale searches; doesn't fire for active ones.

### 3.8 Empty states & widen-search suggestions

- [ ] When `/api/pets` returns 0, response includes 3 "near-miss" pets (one filter relaxed).
- [ ] UI: empty state per §2.6.1.
- [ ] "Widen my search" naming the specific filter to relax.
- **Acceptance:** empty states never blank; suggestions identify the most-restrictive filter.

### 3.9 Add Mercylight, Voices for Animals scrapers

- [ ] Same pattern: fixtures, parser, tests.
- **Acceptance:** all 5 scrapers running daily for one week.

### 3.10 Phase 3 ship gate

- [ ] Test full notification loop end-to-end:
  - Create account.
  - Save search.
  - Manually insert a pet matching the search.
  - Verify push arrives within 15 min.
- [ ] Test first-week guarantee:
  - Create account.
  - Wait 7 days OR fast-forward via admin tool.
  - Verify a notification fires per fallback chain.
- [ ] Send Pulse to a test list, verify rendering on email + push.
- [ ] **Exit criteria:**
  - All three tests pass.
  - At least one real (non-test) tester receives a match notification and clicks through.

---

