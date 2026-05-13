# 03 — User flows

> Section 3 of the requirements. See `README.md` for the full index.

## 3. User flows

### 3.1 First-time anonymous user (Browse & Go)

1. Lands on `/` → 3-question quiz modal opens over the swipe stack.
2. Completes the quiz (or taps Skip) — modal closes, swipe stack becomes interactive.
3. If completed, match tier tags appear from pet #1; if skipped, pets sorted by recency × longevity (no tiers, dismissal remembered).
4. Swipes through pets, no account required.
5. Favorites a pet → soft prompt to create account so favorites persist across devices.
6. Taps pet → detail view → "View on SPCA" → leaves to shelter site (handoff event logged).
7. 3 days later: in-app or email check-in: *"Did you reach out?"*

### 3.2 First-time anonymous user (Watch & Wait)

1. Lands on `/`, swipes a few times, doesn't see a current match.
2. Adjusts filters in `/search`, still nothing perfect.
3. Empty state: *"We're watching 9 shelters for you. Save this search?"*
4. Saves search → prompted to create account.
5. Account created via magic link; anonymous data migrated (§2.2.1).
6. Continues filling profile progressively over later sessions.
7. Within 7 days, first guaranteed notification fires.
8. Weeks later: receives push for new match → opens app → taps through to shelter.

### 3.3 Returning user — daily ritual

1. Opens app to "Possibly Yours" — 5 curated pets for the day.
2. Reviews favorites, adds notes.
3. Compares 2–3 favorites side-by-side.
4. Reads the latest adoption story.

### 3.4 Returning user — notification-driven

1. Receives push: *"New match: Bao at SOSD fits your saved search 'small HDB-approved dog.'"*
2. Taps notification → directly to Bao's detail view.
3. Reads, swipes through photos, taps "View on SOSD."
4. Returns later, gets post-handoff check-in.

### 3.5 Sharing flow

1. User views a pet, taps Share.
2. Web Share API opens with prefilled text + public URL `/share/pet/[id]`.
3. Sends to partner via WhatsApp/Telegram.
4. Partner opens link → server-rendered read-only page (no auth, no JS required) → footer CTA to install/visit app.

### 3.6 Post-adoption flow (v1.5)

1. User confirmed adoption via handoff check-in.
2. 2–3 weeks later: gentle prompt for an update.
3. Submission goes to moderation queue.
4. Approved stories appear in carousel and `/stories`.

### 3.7 iOS user enabling notifications

1. User taps "Save Search" or "Notify Me."
2. App detects iOS Safari without home-screen install.
3. Walkthrough: "iOS requires home-screen install for push. Here's how — 10 seconds."
4. After install, push permission prompt fires normally.
5. Until install: email + in-app notifications.

---

