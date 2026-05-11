# 06 — Edge cases

> Section 6 of the requirements. See `README.md` for the full index.

## 6. Edge cases

### 6.1 Data ingestion

- **Site structure changes** → scraper breaks. Admin alerted on > 50% drop. Per-source isolation. Manual fix within 48h.
- **Cross-posted dog** → photo similarity flags; no auto-merge.
- **Status changes between scrapes** → history captures trail; UI shows current.
- **Wrong LLM extraction (false-positive HDB-approved)** → §2.1.4 rules: low-confidence treated as null for filtering. Never falsely tell user a pet fits HDB.
- **No photo** → hidden from swipe, visible via direct link/search with placeholder.
- **No name** → "Unnamed [species]".
- **"Puppy" age** → LLM normalizes to estimate; display shows source phrase.
- **Photo URL 4xx/5xx** → frontend placeholder; backend marks `broken`, re-fetches.
- **Site temporarily down** → last-known-good with staleness signal; if down > 7 days, hide their listings.

### 6.2 Match scoring

- **Incomplete profile** → tier shown only when essentials answered.
- **Incomplete pet data** → score with what's available; missing data noted.
- **Profile self-contradicts** (HDB + favorites 60cm dog) → don't filter; show as Stretch with explanation.
- **Hard fails never hidden** — dimmed with educational overlay.
- **All Stretch** → don't display tier badges; recency sort to avoid feeling broken.
- **Recomputation backlog** → fall back to last cached; banner if > 1h stale.
- **Profile change mid-session** → invalidate displayed scores, refetch on next card.

### 6.3 Notifications

- **0 matches for 4+ weeks** → quiet-failure check-in (§2.7.3).
- **OS notifications disabled** → in-app banner; email digest instead.
- **Push token expires** → mark stale, prompt re-enable next session.
- **Notif fires for adopted pet** → opening shows detail with "adopted" banner + similar.
- **Unsubscribe-all** → respect immediately; confirmation email.
- **iOS no-install** → email + in-app; walkthrough offered.
- **First-week guarantee finds nothing** → §2.7.5 fallback chain ensures something sends.

### 6.4 User account

- **Sign in on new device** → favorites and saved searches sync from server.
- **Anon → registered with conflicting data** → server-side merge by union; no loss.
- **Account deletion** → PII removed within 24h.
- **Magic link expires** → request new; old invalidates.
- **Magic link intercepted** → 15-min + single-use limits exposure; revoke from `/profile`.
- **Tab A signed in, Tab B anonymous** → Tab B detects auth on next API call.
- **Two browsers favorite same pet anonymously then sign in** → idempotent migration.

### 6.5 Shelter side

- **Removal request** → `shelters.active=false`; scraper skips; data soft-deleted within 48h; statement on About.
- **URL changes** → graceful failure, alert, manual update.
- **Wants more control** → v2 staff portal. v1 response: explain we link directly.

### 6.6 Sharing

- **Pet adopted before recipient views** → public page shows status + similar pets.
- **Public URL shared widely** → no read rate limit; no PII; cached at edge.

### 6.7 Empty / sparse

- **0 matches** → empty state with widen suggestions.
- **All scrapers fail** → last-known-good; admin alert; staleness badges at 48h.
- **All favorites become `gone`** → "no longer listed" + "find similar" CTA.

### 6.8 Performance

- **200+ favorites (anon cap)** → "create an account for unlimited."
- **Stack runs out** → friendly empty state.
- **Service worker stale** → background refetch.

### 6.9 Legal and PDPA

- **Cease-and-desist** → immediate removal; one config flag deactivates source.
- **Privacy infringement claim** → contact form to admin, manual review.
- **Foreign user** → app works; HDB rules clearly SG-specific.
- **Story flagged** → hidden pending review within 48h.
- **Data breach** → `ops/incident-response.md` (notify within 72h per PDPA; rotate secrets; post-mortem).

### 6.10 Operational

- **Vercel deploy breaks** → one-click rollback; incident logged.
- **Migration fails mid-deploy** → wrapped in transactions where possible; otherwise documented rollback steps per migration.
- **LLM API outage** → extraction skipped; pets show without enriched fields; cached unaffected.
- **Cost spike** → daily LLM cap; 80% free-tier alerts; manual investigation.

---

