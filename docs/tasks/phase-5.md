# Phase 5 — Polish & v1.5 prep

> ~15 hours. See `README.md` for the full task index and working principles.

**Goal:** polish for public launch and prepare scaffolding for v1.5 features.

**Ship gate (measurable):**
- Public launch post drafted.
- All critical accessibility issues resolved (keyboard navigation, screen reader on key pages).
- Lighthouse scores: Performance > 80, Accessibility > 95, PWA > 90.
- Privacy policy and terms published.

### 5.1 Admin dashboard

- [ ] `/admin` route, password-gated + IP allowlist.
- [ ] Pet table with manual override of any field.
- [ ] Adoption story moderation queue UI (placeholder for v1.5).
- [ ] Scraper health dashboard: last run per source, pass/fail, count delta.
- [ ] Notification metrics: send count, open rate, click rate, unsubscribes.
- [ ] LLM extraction audit list.
- [ ] Cost dashboard from `cost_log`.
- **Acceptance:** all admin views functional; manual overrides reflect in user-facing app within 1 minute.

### 5.2 PDPA polish

- [ ] Privacy policy page at `/legal/privacy`.
- [ ] Terms at `/legal/terms`.
- [ ] Cookie banner if any analytics added.
- [ ] One-click account deletion in `/profile`.
- [ ] Data export on request: documented manual process in `ops/`.
- [ ] Email preferences page with granular toggles.
- **Acceptance:** legal review of policy text by a real lawyer if budget allows; DELETE flow tested end-to-end.

### 5.3 About / Sources page polish

- [ ] Mission statement.
- [ ] Each shelter with logo, link, last-scraped, pet count, blurb.
- [ ] Disclaimer about unofficial directory.
- [ ] Contact form for shelters (form posts to admin email via Resend).
- **Acceptance:** every shelter listed with all metadata; form sends test email successfully.

### 5.4 User-submitted stories scaffolding (v1.5 prep)

- [ ] Migration: extend `adoption_stories` with `flag_count`, `source_type='user_submitted'` support.
- [ ] After "yes/got response" handoff + 2–3 weeks → prompt for update.
- [ ] Submission form: name, photo upload, short text.
- [ ] Moderation queue in admin.
- [ ] Photo upload to Supabase Storage with EXIF stripping (per content policy).
- [ ] Approved stories appear in carousel.
- **Acceptance:** end-to-end submission works; moderation queue actionable; rejected stories never displayed.

### 5.5 Performance pass

- [ ] Lighthouse audit on home, swipe, detail, share pages.
- [ ] Optimize images (next/image, responsive sizes).
- [ ] Service worker tuning.
- [ ] Database query review — add missing indexes; eliminate N+1.
- **Acceptance:** Performance score > 80 on all four pages on simulated mobile 4G.

### 5.6 Accessibility pass

- [ ] Keyboard navigation through swipe stack.
- [ ] Screen reader testing on detail, swipe, home, share pages.
- [ ] Color contrast audit.
- [ ] Reduced-motion alternative for swipe animation.
- [ ] Real alt text on every image (LLM-generated for those without).
- **Acceptance:** Accessibility score > 95; manual screen reader walkthrough completes all key flows.

### 5.7 Operational readiness

- [ ] Document `ops/disaster-recovery.md` with full restore procedure.
- [ ] **Actually test the restore** — provision a separate staging Supabase project, restore latest backup, run smoke tests, time the full process. Document actual elapsed time. (Budget: 2 hours.)
- [ ] Document `ops/incident-response.md` with breach notification template (PDPA 72h rule).
- [ ] Document `ops/migration-runbook.md` for breaking schema changes.
- [ ] Document `ops/pr-review-checklist.md` for self/peer review.
- [ ] Configure UptimeRobot to ping `/api/health` (every 5 min, alert after 2 consecutive failures).
- [ ] Configure cost-monitoring cron with alerts at 80% of free-tier limits.
- [ ] Configure Vercel rollback procedure; do a test rollback (deploy known-bad change, roll back, verify).
- **Acceptance:** restore-from-backup completes within RTO of 4h (timed); rollback tested successfully; all runbooks reviewed by a second person if available.

### 5.8 Launch prep

- [ ] Draft launch post for r/singapore, relevant Telegram and Facebook groups.
- [ ] Reach out to shelters with heads-up email, offering opt-out.
- [ ] Soft launch to 50 users via direct invite.
- [ ] Monitor for 1 week — fix critical bugs.
- [ ] Public launch.
- **Acceptance:** post drafted and reviewed; at least 3 shelters acknowledged the heads-up; 50 soft-launch users active.

### 5.9 Post-launch monitoring (ongoing, not a single task)

- [ ] Daily: scraper health check.
- [ ] Weekly: notification engagement metrics review.
- [ ] Monthly: adoption check-in response rates; success metric tracking.
- [ ] Per-incident: response per `ops/incident-response.md`.

---

