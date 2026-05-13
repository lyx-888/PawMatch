# 02 — Features

> Section 2 of the requirements. See `README.md` for the full index.

## 2. Features

### 2.1 Data ingestion

#### 2.1.1 Sources (v1)

Nine SG shelters, each with its own scraper module:

| Source | Site type | Scraping difficulty | v1 priority |
|---|---|---|---|
| SPCA | Static HTML gallery | Easy | P0 (Phase 1 validation source) |
| SOSD | Static profile pages | Easy | P0 |
| OSCAS | Portfolio grid | Easy | P0 |
| Mercylight | Static | Medium | P1 |
| Voices for Animals | Static | Medium | P1 |
| Action for Singapore Dogs | Static | Medium | P1 |
| Exclusively Mongrels | Mostly social-media | Hard | P2 (partial coverage acceptable) |
| Causes for Animals | Heavy Facebook | Hard | P2 |
| Cat Welfare Society | Mixed | Medium | P2 |

#### 2.1.2 Definition of "verified shelter"

A source is added if all are true:
- Registered Singapore charity verifiable on charities.gov.sg, OR a long-standing volunteer-run rescue with public reputation (e.g., SOSD, OSCAS).
- Operates physical adoption process (not pet sales, not breeders).
- Has a public listing of available animals.
- We have made a good-faith attempt to inform them of inclusion.

Adding a 10th+ source is a deliberate decision recorded in this changelog, not automatic.

#### 2.1.3 Pipeline

- Scheduled run: daily at 03:00 SGT.
- Each scraper exports `scrape() -> list[PetRecord]` matching the canonical schema.
- Upsert by `(source, source_id)`.
- Pets missing from a scrape marked `gone` after a 3-day grace period.
- After upsert, an LLM extraction pass enriches new and changed records (§2.1.4).
- Per-source isolation: one scraper failing must not affect others; failure logged and surfaced in admin (§2.13).

#### 2.1.4 LLM extraction

Structured extraction of fields shelters don't expose cleanly:

| Field | Type | Conservative default | Notes |
|---|---|---|---|
| `hdb_approved` | bool \| null | `null` | `true` only if size + breed clearly fit HDB rules. Never `true` for unknown size. |
| `size` | enum (small/medium/large) \| null | `null` | Inferred from weight or breed. |
| `age_months` | int \| null | `null` | Best estimate ("2 yr" → 24, "puppy" → 4). |
| `energy_level` | enum (low/medium/high) \| null | `null` | |
| `tags` | string[] | `[]` | Fixed vocabulary: `good_with_kids`, `good_with_cats`, `good_with_dogs`, `special_needs`, `house_trained`, `senior`, `shy`, `active`, `needs_foster`. |

**Confidence handling:**
- Each extraction returns a confidence per field (0.0–1.0).
- Fields with confidence < 0.7 stored but flagged `low_confidence`.
- Low-confidence `hdb_approved=true` treated as `null` for filtering and matching — we never falsely tell a user a pet fits HDB.
- Admin dashboard surfaces low-confidence extractions for human override.
- Low-confidence values display "auto-extracted, may be inaccurate" on the detail page.

**Caching:**
- Results cached by `sha256(description + extraction_schema_version)`. Schema version bumped when we change fields or prompt.
- Cache hit avoids LLM call entirely.

**Cost ceiling:**
- Daily spend cap: $2 USD enforced at the wrapper level.
- Exceeding cap stops new extractions until next day; existing data continues to serve.
- Weekly LLM spend reported in admin.

#### 2.1.5 Status transitions

```
available → pending → adopted → gone
         ↘         ↗
          → gone (delisted without status indicator)
```

- `available` is the default for new listings.
- `pending` and `adopted` inferred from source. **Detection is per-shelter** — different shelters use different conventions (e.g., "PENDING" overlay on photo, ❤️ emoji prefix in title, separate page section). Each scraper module owns its detection logic and is tested with fixtures covering each status.
- `gone` set when a pet missing from scrapes for 3+ consecutive days AND no `pending`/`adopted` indicator preceded the disappearance. If a `pending` pet disappears, it transitions to `adopted` (most likely outcome) rather than `gone`.
- All transitions logged in `pet_status_history` for the alert system.
- **Conservative bias:** when in doubt, leave status as `available`. False-`available` is harmless (user contacts shelter, learns it's adopted); false-`adopted` is harmful (user misses a pet that's still available).
- Manual override available in admin.

#### 2.1.6 Photo handling

- v1: hotlink photos directly from shelter sites. Acceptable for a side project; revisit if a shelter objects.
- Each pet record stores all source photo URLs.
- Frontend uses `next/image` with remote patterns configured per source domain.
- Fallback: when a photo URL returns 4xx/5xx, frontend shows placeholder with pet's name; backend marks URL `broken` and re-fetches on next scrape.
- No EXIF stripping needed since we don't host images. If we cache (v1.5), strip EXIF on intake.
- No image format conversion in v1.

#### 2.1.7 Deduplication

- Photo similarity hash (perceptual hash, e.g., pHash) computed at intake.
- Duplicates within 5% Hamming distance flagged for admin review.
- Never auto-merge — surface to admin only.

### 2.2 Onboarding (upfront with skip)

**Step 1 — Quiz on first visit.** On first landing (anonymous or authenticated, with no profile in localStorage / server), the user is prompted with the 3-question quiz as a modal over the swipe surface, before swipe gestures are enabled. The modal can be completed *or* explicitly skipped — both paths unlock the swipe stack.

**Step 2 — Three essential questions:**
- Housing type — HDB / Condo / Landed / Other.
- Kids in household — Yes / No.
- Other pets in household — None / Cats / Dogs / Both.

These three power the hardest constraints and activate match scoring. Match tier tags (Great / Good / Stretch / Not eligible) appear on every pet card from session start once these are answered.

**Step 3 — Skip path.** If the user dismisses the quiz, the dismissal is recorded so the modal does not re-block in subsequent sessions. The swipe stack works without match tiers — pets are sorted by recency × longevity (the original "browse and go" experience). A "Complete your profile" entry stays visible in the nav so the user can opt back in any time.

**Step 4 — Progressive profiling.** Remaining lifestyle data continues to be asked contextually after the essentials are answered (or after a user opts back in via the profile screen):

| Trigger | Question |
|---|---|
| First time viewing a cat | "Do you have meshed windows? (Required for cat adoption in SG)" |
| First "Stretch" tier shown | "Activity level — sedentary / moderate / very active?" |
| First special-needs pet viewed | "Open to special-needs pets?" |
| First favorite | "Work-from-home pattern?" |
| Third favorite | "Prior pet experience?" |
| Saving a search | "Monthly budget for pet care?" |

Each is one tap to answer or dismiss. Profile completion percentage tracked.

**Step 5 — Account creation** only on persistence triggers:
- Saving a search.
- Favoriting more than 3 pets.
- Enabling notifications.
- Following a shelter.

Account never blocks the swipe. The quiz blocks the swipe only on the very first visit, and is always skippable.

#### 2.2.1 Anonymous → registered migration

When an anonymous user creates an account, all localStorage state migrates to the server:

1. On magic link redirect, client reads localStorage (favorites, passes, profile, notes, seen-snippets).
2. `POST /api/auth/migrate` with the payload + new auth token.
3. Server processes idempotently: if data already exists for this user (rare, e.g., signed in on another device), merge by union (favorites + favorites, max of completion fields, etc.).
4. On success, localStorage is cleared.
5. On failure, localStorage preserved and a retry banner shown.

**Cross-device limitation:** Anonymous data is per-browser. A user who swipes on mobile and creates an account on desktop will lose their mobile favorites. Communicated at signup: *"Sign in to sync your favorites across devices."*

### 2.3 Match scoring

#### 2.3.1 Algorithm

Weighted sum with hard-fail short-circuits. Each component returns a number in [-1.0, 1.0]; weights are integers; the score is clamped to [0, 100].

```
component_scores = {
    housing_fit:       housing_fit_score(profile, pet),         # see 2.3.1.a
    size_fit:          size_fit_score(profile, pet),            # see 2.3.1.b
    energy_fit:        energy_fit_score(profile, pet),          # see 2.3.1.c
    experience_fit:    experience_fit_score(profile, pet),      # see 2.3.1.d
    compatibility:     compatibility_score(profile, pet),       # see 2.3.1.e
    special_needs:     special_needs_score(profile, pet),       # see 2.3.1.f
}

raw = 50 + sum(weight[c] * component_scores[c] for c in components)
score = clamp(round(raw), 0, 100)

if any hard_fail (see 2.3.2):
    tier = 'hard_fail'
    score = min(score, 30)
elif profile_completion_pct < 60:           # essentials only
    tier = 'good' if score >= 55 else 'stretch'   # cannot reach 'great'
else:
    tier = 'great'   if score >= 75
         | 'good'    if score >= 55
         | 'stretch' otherwise
```

**Why scores are clamped to [0, 100]:** with default weights summing to 100 and component outputs in [-1, 1], theoretical raw range is [-50, 150]. Clamping keeps the displayed score interpretable as a percentage-like value without renormalizing.

**Empirical distribution target:** with default weights and a representative profile, real listings should produce roughly 15% great / 35% good / 50% stretch, with hard_fail orthogonal. If a tester's distribution is wildly different (e.g., 80% great), recalibrate weights before shipping.

##### 2.3.1.a `housing_fit_score`
```
HDB user, dog ≤ 10kg, breed on Project ADORE list (or unspecified breed):  +1.0
HDB user, dog ≤ 10kg, breed not on ADORE:                                    0.0  (also hard_fail)
HDB user, cat (mesh confirmed):                                              +1.0
HDB user, cat (mesh unspecified):                                             0.0
Condo/Landed user, any pet:                                                  +0.5
Profile incomplete (no housing_type):                                         0.0
```

##### 2.3.1.b `size_fit_score`
```
HDB user, dog small (≤ 10kg):       +1.0
HDB user, dog medium:                0.0
HDB user, dog large:                -1.0  (also hard_fail)
Condo, dog small:                   +0.5
Condo, dog medium:                  +1.0
Condo, dog large:                   +0.5
Landed, dog any size:               +1.0
Cat or rabbit (any housing):        +1.0
Pet size unknown:                    0.0
```

##### 2.3.1.c `energy_fit_score`
```
user_activity = sedentary, pet_energy = low:        +1.0
user_activity = sedentary, pet_energy = medium:      0.0
user_activity = sedentary, pet_energy = high:       -1.0
user_activity = moderate, pet_energy = medium:      +1.0
user_activity = moderate, pet_energy = low|high:    +0.3
user_activity = active,   pet_energy = high:        +1.0
user_activity = active,   pet_energy = medium:      +0.5
user_activity = active,   pet_energy = low:         -0.3
either unknown:                                       0.0
```

##### 2.3.1.d `experience_fit_score`
```
user experience = first_time, pet tagged 'special_needs' or 'shy':  -1.0
user experience = first_time, listing notes 'first-time-friendly':  +1.0
user experience = some|experienced, any:                            +0.5
profile incomplete:                                                  0.0
```

##### 2.3.1.e `compatibility_score`
For each relevant trait (kids, cats, dogs in user's home):
```
trait present in user, pet tagged compatible:        +0.4 each, max +1.0 summed
trait present in user, pet compatibility unstated:   -0.2 each, capped at -0.4
trait present in user, pet tagged incompatible:      -1.0  (also hard_fail)
trait absent in user:                                 0.0
```

##### 2.3.1.f `special_needs_score`
```
pet tagged special_needs, user special_needs_ok=true:    +1.0
pet tagged special_needs, user special_needs_ok=false:   -1.0
pet not special_needs:                                    0.0
profile incomplete:                                       0.0
```

##### 2.3.1.g Project ADORE breed list

Singapore HDB allows specific dog breeds in flats under Project ADORE regardless of weight, plus Singapore Specials (local mixed-breeds) up to 15kg. The full current list is documented in `web/lib/matching/adore-breeds.ts` and reproduced in `requirements-appendix.md` for reference. The list changes occasionally; admin can update it without a code change via that file. Whenever the list updates, all `match_scores` for HDB users are recomputed.

The list snapshot at v1 launch includes (non-exhaustive): Singapore Special (≤ 15kg), Maltese, Bichon Frise, Cavalier King Charles Spaniel, Chihuahua, Pomeranian, Shih Tzu, Jack Russell Terrier, plus others. **Treat the file as canonical, not this paragraph.**

#### 2.3.2 Hard fails

- HDB user, dog > 10kg AND breed not on Project ADORE list → `hard_fail("Not eligible for HDB flats")`.
- HDB user, dog height > 55cm → `hard_fail("Exceeds HDB height limit")`.
- Cat adoption, user reports unmeshed windows → `hard_fail("Mesh required before cat adoption")`.
- User has cats, pet tagged `not_good_with_cats` → `hard_fail("Not compatible with cats in your home")`. Same for dogs and kids.

Hard fails never hide a pet — display dimmed with educational overlay and alternative suggestions.

#### 2.3.3 Default weights

| Component | Weight |
|---|---|
| housing_fit | 25 |
| size_fit | 15 |
| energy_fit | 15 |
| experience_fit | 10 |
| compatibility | 20 |
| special_needs_alignment | 15 |

Defaults baked into code, not user-tunable in v1. Logged with each computed score (`weights_version`) so we can A/B test changes.

#### 2.3.4 Tier thresholds

- `great`: score ≥ 75 AND no hard fails AND `completion_pct ≥ 60`.
- `good`: 55–74 AND no hard fails. Also: scores ≥ 75 from sparse profiles (`completion_pct < 60`) are floored to `good`.
- `stretch`: < 55 AND no hard fails.
- `hard_fail`: any hard fail (overrides everything else).

The `completion_pct ≥ 60` gate corresponds to roughly: 3 essentials + 3 contextual answers. Don't promise great matches with shallow data.

When a user's `completion_pct` crosses the threshold mid-session, all currently-displayed tier badges are stale until refetched on next card render.

#### 2.3.5 Reason generation

Server-side templates filled with pet-specific values:

```
("housing_fit_pass", "{name} ({weight}kg) fits HDB's 10kg limit")
("housing_fit_fail", "{name} is {weight}kg, above HDB's 10kg limit")
("energy_match", "{energy} energy matches your {user_activity} lifestyle")
("compat_kids_pass", "Listing notes {name} is good with kids")
("compat_kids_unknown", "Compatibility with kids not stated — ask the shelter")
```

- Two reasons displayed on the swipe card (one positive, one note/risk if applicable).
- Full breakdown on detail via "Why am I seeing this?"
- Templates use the pet's name and concrete numbers, never generic praise.

**Hard-fail messaging is a separate template family.** Hard-fail pets get an explicit overlay: a one-line summary of why this pet doesn't fit (e.g., *"Not eligible for HDB flats — {name} is {weight}kg, above the 10kg limit."*) plus an alternative-suggestion line (e.g., *"Looking for HDB-friendly dogs? See {count} small dogs under 10kg."*) The summary template is one of the `housing_fit_fail`, `mesh_required`, or `compat_*_incompatible` strings depending on which constraint failed.

#### 2.3.6 Recomputation

Scores precomputed and cached in `match_scores`. Recomputation triggers and strategy:

| Trigger | Job | Scope | Bounding |
|---|---|---|---|
| User profile field changes | `match_score.recompute_user(user_id)` | All `available` pets × this user | Single job per user; debounced 30s if multiple changes |
| Pet `available` → `available` (data update) | `match_score.recompute_pet(pet_id)` | This pet × all users with `completion_pct ≥ 30` | Capped at top 1000 most-recently-active users; full recompute runs nightly |
| Pet → `gone` / `adopted` | inline DB update | Mark all scores `stale=true` | No fan-out |
| Weights version bump (rare) | `match_score.recompute_all()` | All users × all pets | Manual trigger only; processed in batches of 5000 |

**Invocation path** (Postgres → Inngest):
1. Postgres trigger writes a row to `recompute_queue` table.
2. Inngest cron (`every 30 seconds`) drains the queue in batches.
3. Each batch becomes one Inngest event; Inngest handles retry, deduplication, concurrency.

This avoids Postgres → HTTP webhooks (which Supabase doesn't natively support without `pg_net` and adds failure modes), and keeps Inngest event volume bounded. **Expected volume:** ~50 events/day at month 6 scale, well under the 50K/month free tier.

**Failure modes:**
- Inngest down → `recompute_queue` accumulates; users see stale scores; banner if any score > 24h old.
- Job times out → Inngest retries with backoff; after 3 failures, alert sent and the row is moved to `recompute_queue_dead` for manual review.
- DB triggers fail to fire (e.g., RLS issue) → caught by nightly full-reconciliation cron that finds users with profile changes since last computed and enqueues them.

**Anonymous users:** no server-side match scores. Tiers for anonymous users are computed client-side from the same algorithm, with the localStorage profile as input. This duplicates the algorithm in TypeScript and Python — kept in sync via a shared test fixture in `tests/matching-fixtures.json` exercised by both implementations.

### 2.4 Discovery surfaces

- **Swipe stack** (`/`) — primary surface. Sorted by tier desc, then `first_seen_at` desc within tier. Excludes passed and favorited pets.
- **Possibly Yours daily feed** — 5 pets/day per active user. **Generation rules:**
  - Generated for users active in last 14 days only (controls Inngest cost).
  - Run once per day at 06:00 SGT.
  - Mix: up to 2 best-tier matches not yet swiped, up to 2 long-timer matches scoring ≥ good, 1 wildcard from "new in last 7 days." Padding from next-best-tier if any slot is empty.
  - Stored in a `daily_picks` table with `(user_id, date, pet_ids[])`.
  - Pets shown in Possibly Yours within the last 14 days excluded from picks unless they're a new top match.
  - **Cost:** at 5K active users × 1 daily run = 5K Inngest events/month. Combined with notification dispatch (~3K/month) stays comfortably under 50K free tier. Past 20K active users we move to Inngest paid or batch generation.
- **Long-timer feed** (`/discover/long-timers`) — pets meeting any of: listed 90+ days, age ≥ 7 years (senior), or tagged `special_needs`. Sorted by listing duration descending. "Long-timer" elsewhere in this doc refers to this same set.
- **Curated lanes** (`/discover`) — *"Singapore's longest-waiting dogs"* (auto), *"Cats who'd love a quiet home"* (manual), *"First-time-adopter friendly"* (manual), *"Needs a foster"* (auto from `needs_foster` tag).
- **Browse all** (`/search`) — full filterable grid view.

### 2.5 Pet detail view (`/pets/[id]`)

- Photo carousel (tap zones for prev/next, swipe gesture, full-screen on long-press).
- Name, key facts row (age, breed, sex, size, source).
- Tier label with full reasoning + "Why am I seeing this?" expandable.
- Source description (verbatim, "from listing" label).
- Auto-extracted attributes ("auto-extracted, may be inaccurate" footer if low-confidence).
- Last-updated timestamp; "verify on shelter site" badge if `last_seen_at` > 48h.
- Status badge (available / pending / adopted / gone) with messaging.
- Embedded readiness snippet if contextually relevant (§2.9).
- Activity indicator ("listed 3 days ago," "favorited 8 times this week").
- Primary CTA: **View on [Shelter]** (opens `source_url` in new tab; logs handoff event).
- Secondary actions: Save, Pass, Share, Note (Note only after Save).

### 2.6 Filters

- Species, size, age range, sex, source shelter (multi-select), HDB-approved (yes/no/show all), compatibility tags (include filters), special-needs (include/exclude), listed-since.
- Live result count updates as filters change (count debounced 300ms — feels instant for typical typing speed, avoids hammering the DB on every keystroke).
- Save search button — prompts account creation if anonymous.
- "Widen my search" — when result count < 5, suggest specific filter to relax.

#### 2.6.1 Empty states

| Situation | Display |
|---|---|
| Filters return 0 pets | "No matches today. We're watching N shelters for you. Save this search? Here are 3 pets slightly outside your filters." |
| Stack exhausted | "You've seen everything matching your filters. Want to widen, save a search, or check back tomorrow?" |
| Saved search 0 matches for 4+ weeks | (notification) "Quiet month — only N pets matched. Want to widen?" |
| User has no favorites | "Start swiping — pets you favorite will appear here." |
| Notifications disabled | "Notifications off. We're still watching, but you'll need to check back manually. Enable?" |

### 2.7 Notifications

#### 2.7.1 Channels

- **Push** (Web Push) — primary on Android and desktop browsers.
- **Email** — fallback when push unavailable; weekly digest for all users.
- **In-app** — banners and badges for users without push or email.

#### 2.7.2 iOS Web Push reality

iOS Safari supports Web Push only after the user installs the PWA to home screen (iOS 16.4+). Real activation cliff.

Mitigation: when iOS user enables notifications, surface "Add to Home Screen" walkthrough; until then, deliver email + in-app instead. Acceptable degradation, communicated honestly.

#### 2.7.3 Notification types

| Type | Trigger | Default frequency cap |
|---|---|---|
| Match alert | New pet matches saved search above tier threshold | 1/day per search, 3/week total |
| Status alert | Favorited pet's status changes | Immediate, no cap |
| Long-timer suggestion | Long-timer matches profile (great/good only) | 1/week |
| Weekly Pulse | Sunday morning | 1/week (digest) |
| First-week guarantee | Within 7 days of signup, anything relevant | 1 |
| Quiet-failure check-in | Saved search 0 matches for 4+ weeks | 1/month |

#### 2.7.4 Defaults and user control

- Default: 1 notification per week (excluding status alerts on favorites).
- "Ping me more" toggle: match alerts up to 3/day, long-timer to 2/week.
- Per-saved-search `tier_threshold` defaults to "Great + Good"; user can change.
- Quiet hours: 10pm–8am SGT, non-overridable.
- Notification preferences with granular toggles per type.

#### 2.7.5 First-week guaranteed notification

Within 7 days of signup, every user gets at least one relevant notification.

**Timing:** the cron runs every 6 hours (00:00, 06:00, 12:00, 18:00 SGT) and identifies users at `created_at + interval '7 days' - interval '6 hours'` to `created_at + interval '7 days'`. Worst case, a user gets the notification at day 7 ± 6 hours, never later.

**Channel selection:**
1. Push if subscribed and supported on user's platform.
2. Email if not, or as additional channel.
3. **iOS without home-screen install:** email only (in-app banners require active session, which we can't guarantee). Banner shown next time they open the app, even if late.

**Content fallback chain:**
1. If a saved search produced a match this week — that.
2. Else if a favorited pet's status changed — that.
3. Else if any long-timer pet scores ≥ good for this user — top one.
4. Else send the Weekly Pulse early.
5. Else send a "we're watching" reassurance: *"Quiet week — N pets currently match your profile. Here's the top one."* (Always at least one available pet exists — fallback is the global top-of-feed pet if not personalized.)

Always something to send.

#### 2.7.6 Weekly Pulse content

- Top 5 new pets this week.
- Total adoptions logged across SG shelters this week.
- "Longest-waiting pet of the week."
- One adoption story.
- Sent every Sunday 9am SGT.
- Opens and clicks tracked.

### 2.8 Engagement features

- **Personal notes** on favorited pets (textarea, ≤ 500 chars, plain text).
- **Compare view** — pick 2–3 favorites, side-by-side.
- **Follow a shelter** — get all new arrivals from that shelter, regardless of match.
- **Share a pet** — Web Share API with prefilled text + public URL.
- **Share a saved search** — public read-only URL listing currently-matching pets.

### 2.9 Adoption readiness (embedded)

Contextual snippets, never homework. Each is one inline expandable card.

| Trigger | Snippet content (summary) |
|---|---|
| First HDB-approved dog viewed | HDB rules: weight, height, breed list, ADORE program. |
| First cat viewed | Window meshing requirement, what counts, where to get it. |
| First special-needs pet viewed | What "special needs" means, cost, time. |
| Third favorite | Estimated monthly cost breakdown by species/size. |
| First long-timer favorited | Why long-timers often need experienced adopters. |
| First Stretch tier viewed | Why this is a stretch and what would change it. |

Each snippet:
- Dismissable (won't reappear) and expandable.
- Tracks view in user state (db or localStorage).
- "More on this" link to full deep-dive in `/learn`.

### 2.10 Trust and social proof

- **Live counter** on home: *"1,247 pets currently looking for homes across 9 SG shelters. Last updated 2h ago."*
- **Adoption stories carousel** on home (curated/shelter-sourced for v1, user-submitted in v1.5).
- **Shelter trust signals** on every card.
- **Activity indicators**: listing recency, recent favorites, recent adoptions.
- **Sources page** (`/about`) — full shelter list with logos, verification, last-scraped time, current pet count, contact form.

### 2.11 Handoff to shelters

- Primary CTA on every detail page: **View on [Shelter]**.
- Optional **prefilled intro message**, generated from user profile, copy-paste-ready.
- Light brand attribution: *"Mention you saw [Pet] on PawMatch — helps us improve."*
- **Post-handoff check-in** — 3 days after tap-through:
  - "Did you reach out about [Pet]?"
  - Options: yes/got response, yes/no response yet, no/changed mind.
  - Used for: shelter response time stats, re-engagement, future story prompts.

### 2.12 Adoption stories

- Carousel on home (3–5 stories, swipeable).
- Full feed at `/stories`.
- v1: shelter-sourced or self-curated only (admin-created).
- v1.5: user-submitted via post-adoption prompt with moderation.
- Each story credits the source shelter.

#### 2.12.1 Content policy (for user-submitted, v1.5)

Allowed: photos of the user's adopted pet, photos with family (with consent confirmation), short text describing adoption.

Prohibited:
- Photos that don't depict the adopted pet.
- Photos of minors without explicit parental consent confirmation.
- Negative content about specific shelters (route to feedback channel).
- Commercial promotion.
- Anything illegal under SG law.

Takedown: any visitor can flag a story; flagged stories hidden pending admin review within 48h.

### 2.13 Admin

Password-gated `/admin`, accessible to project owner only in v1.

- **Pet table** with manual override on any field.
- **LLM extraction audit** — low-confidence list, batch-correctable.
- **Adoption story moderation queue** (v1.5).
- **Scraper health dashboard** — last run, success/failure, count delta, error logs.
- **Notification metrics** — sends, opens, clicks, unsubscribes per type.
- **Cost monitor** — LLM spend, Vercel bandwidth, Supabase usage vs caps.
- **User support tools** — look up user by email, view state, manually trigger account deletion.

### 2.14 Rate limiting and abuse prevention

| Endpoint | Limit |
|---|---|
| `GET /api/pets` (anonymous) | 60 req/min per IP |
| `GET /api/pets` (auth) | 120 req/min per user |
| `POST /api/auth/magic-link` | 5 req/hour per email, 20 req/hour per IP |
| `POST /api/auth/migrate` | 3 req/hour per anonymous_id; max payload 500KB |
| `POST /api/favorites` | 100/hour per user |
| `POST /api/saved-searches` | 20/hour per user |
| `POST /api/stories` (v1.5) | 1/day per user |
| `POST /api/handoff` | 60/day per user |
| Public `/share/*` | 300 req/min per IP |

Limits enforced at Vercel middleware. Returns 429 with `Retry-After`.

Per-user resource caps (registered users):
- Saved searches: 20 max.
- Followed shelters: 9 (all of them, naturally bounded).
- Favorites: 1000 max (warning at 800).
- Notes per favorite: 500 chars.

Anonymous localStorage caps:
- Favorites: 200 max (warning at 150, block-with-message at 200).
- Passes: 1000 max (FIFO eviction).
- Total localStorage budget: 5MB target, 10MB hard ceiling (browser-imposed).

---

