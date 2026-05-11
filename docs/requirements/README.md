# Requirements — index

> Singapore-only pet adoption companion. Aggregates listings from major SG shelters, surfaces them through a swipe interface, watches for the right pet on behalf of users.

**Read by section, not by file.** When a task says "per requirements §2.3" → open `02-features.md` and find §2.3.

| File | Covers |
|---|---|
| `01-product.md` | §1 Product overview, the problem, the promise, target users, four pillars, non-goals, success metrics |
| `02-features.md` | §2 Features (data ingestion, onboarding, match scoring, discovery, filters, notifications, engagement, readiness, trust, handoff, stories, admin, rate limiting) |
| `03-flows.md` | §3 User flows |
| `04-screens.md` | §4 Screens |
| `05-technical.md` | §5 Technical requirements (tech stack, data model, API, performance, job queue, reliability, privacy, security, PWA, i18n, observability, costs, accessibility, support, process) |
| `06-edge-cases.md` | §6 Edge cases |
| `07-future.md` | §7 Future improvements, §8 Open questions, §9 Changelog |
| `data-model.sql` | Reference SQL extracted from §5.2 |

**Last updated:** 2026-05-10 (v1.1)

## Cross-cutting principles

- Anonymous users are first-class.
- Match scores precomputed, never per-request.
- LLM output never reaches the user without going through Postgres first.
- Conservative defaults: `null` over guessing; never falsely tell a user a pet fits HDB.
- Hard fails are shown dimmed with educational overlay, never hidden.
- PDPA: no PII to third parties, anonymous users have no PII at all, full account deletion within 24h.
