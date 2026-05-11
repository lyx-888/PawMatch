# Phase 4 — Trust & retention

> ~20 hours. See `README.md` for the full task index and working principles.

**Goal:** the app feels alive, trustworthy, and keeps users returning even when they don't have a current match.

**Ship gate (measurable):**
- 10 curated adoption stories on the home carousel.
- Public share URL renders correctly when sent via WhatsApp (preview image, title, description).
- Activity indicators visible on pet cards reflect real data.
- All remaining scrapers running.

### 4.1 Curated adoption stories

- [ ] Migration: `adoption_stories` table.
- [ ] Manually source 10–20 stories from shelter Facebook posts and announcements (with credit).
- [ ] Admin UI to create story entries.
- [ ] `GET /api/stories` paginated.
- [ ] Carousel component on home.
- [ ] `/stories` tab.
- **Acceptance:** carousel displays at least 10 stories; tap navigates to full story view.

### 4.2 Activity indicators

- [ ] Migration: `pet_activity` table per `requirements.md` §5.2.
- [ ] Daily Inngest cron `activity.recompute` updates `pet_activity` with rolling 7-day aggregates of favorites, passes, views (events-driven counts from analytics).
- [ ] Show on swipe card and detail: "listed N days ago," "favorited M times this week."
- [ ] Recently-adopted indicator on pets with `pet_status_history` change in last 7 days.
- **Acceptance:** indicators reflect real data; updated within 24h of underlying activity.

### 4.3 Shelter trust signals

- [ ] Add `verified_since` and `blurb` to `shelters`.
- [ ] Display on every pet card: e.g., "From SPCA — Singapore's oldest animal welfare charity (since 1954)."
- [ ] Sources page expanded with full info.
- **Acceptance:** every card from a verified shelter shows the trust line.

### 4.4 Public share pages

- [ ] `/share/pet/[id]` server-rendered, no JS required, no auth.
- [ ] Clean shareable design with large photo, key facts, View on Shelter CTA, "See more on PawMatch SG" footer.
- [ ] Open Graph and Twitter Card meta tags for nice previews on chat apps.
- [ ] Share button on pet detail uses Web Share API with fallback to clipboard.
- **Acceptance:** WhatsApp preview shows photo, title, description; page works with JS disabled.

### 4.5 Post-handoff check-in

- [ ] Migration: `handoff_events` table.
- [ ] On "View on Shelter" click → `POST /api/handoff` logs the event.
- [ ] Inngest function `handoff.checkin` daily: 3 days post-handoff → in-app or email prompt.
- [ ] User responds via `PATCH /api/handoff/:id`.
- [ ] Yes/got response → invite to share update later.
- [ ] No/changed mind → surface 3 alternative pets.
- **Acceptance:** check-ins fire 3 days after handoff; responses recorded.

### 4.6 Brand attribution to shelters

- [ ] Prefilled intro message includes: "Mention you saw [Pet] on PawMatch when you contact them — helps us improve."
- **Acceptance:** message is copyable; phrasing tested with one shelter for sentiment.

### 4.7 Add remaining scrapers

- [ ] ASD.
- [ ] Exclusively Mongrels (best-effort, partial coverage acceptable).
- [ ] Causes for Animals (best-effort, Facebook-heavy).
- [ ] Cat Welfare Society.
- [ ] Each: fixtures, parser, tests.
- **Acceptance:** at least 7 of 9 scrapers running successfully daily.

### 4.8 Phase 4 ship gate

- [ ] Deploy.
- [ ] Have 5 real users (not just friends) use the app for a week.
- [ ] Watch the first-week notifications fire on real accounts.
- [ ] Collect feedback on adoption stories — do users read them, share them?
- [ ] **Exit criteria:**
  - At least 3 of 5 users open the app on day 3+ unprompted.
  - At least 1 share via Web Share API observed.
  - No critical bugs in the wild.

---

