# 07 — Future improvements, open questions, changelog

> Sections 7, 8, 9 of the requirements. See `README.md` for the full index.

## 7. Future improvements

### v1.5 (3–6 months post-launch)
- User-submitted adoption stories with moderation.
- "For partners" mode — shared favorites/searches between linked accounts.
- Pet personality matching layer.
- Referral mechanic.
- Geofenced "adoption drive this weekend" notifications.
- Improved LLM extraction with active learning.
- Photo caching to own CDN (after permission outreach).

### v2 (6–12 months)
- Lost & found integration.
- Post-adoption hub — vet directory, training, HDB licensing reminders.
- Foster-first flow expansion.
- Demand signals dashboard for shelters.
- Native iOS / Android.
- Mandarin localization.

### v3 (12+ months)
- Regional expansion (MY, HK, AU).
- Donation / supplies pass-through.
- Shelter staff portal.
- Advanced ML matching.
- Sponsor-a-pet program.

### Won't build
- In-app messaging with shelters.
- Adoption applications/contracts in-app.
- User reviews of shelters.
- Forums or community Q&A.
- Pet owner social network.
- Pet supplies marketplace.

---

## 8. Open questions

Items needing a call before the relevant phase begins.

1. **LLM provider abstraction** — single `extract()` interface for swap-ability? *Tentative: yes, pre-Phase 2.*
2. **Match weights ownership post-launch** — who tunes, based on what data?
3. **Shelter outreach timing** — proactive at launch, or wait for first complaint?
4. **Adoption story sourcing for v1** — who writes the curated stories?
5. **Custom domain** — claim `pawmatch.sg` before launch?
6. **Logo and brand** — design before launch or after first feedback?
7. **Open source the code?** — invites contribution, adds maintenance overhead.

---

## 9. Changelog

- **2026-05-10 v1.1** — Second review pass. Added: explicit score component sub-functions with input/output ranges (§2.3.1.a–f), Project ADORE breed list reference (§2.3.1.g), tier cap mechanism clarification (§2.3.4), match score recomputation strategy with bounding (§2.3.6), Possibly Yours algorithm and cost analysis (§2.4), long-timer definition (§2.4), filter timing rationale (§2.6), per-shelter status detection (§2.1.5), iOS first-week notification handling (§2.7.5), per-user resource caps and `/api/auth/migrate` payload limit (§2.14), database role boundaries (§5.2.1), schema constraints (check constraints, deleted_at, recompute_queue, daily_picks, pet_activity tables, photo_urls ordering note), Inngest dead-letter and dispatch outage handling (§5.6), accessibility-from-day-1 statement (§5.13), support and process sections (§5.14, §5.15), hard-fail messaging template (§2.3.5).
- **2026-05-10 v1.0** — Initial v1 spec. Added: success metrics, LLM confidence handling, status transitions, photo handling, rate limits, anonymous data lifetime, iOS PWA reality, observability, security, backup/DR, schema migration coordination, content policy, internationalization stance, cost monitoring, open questions section.
