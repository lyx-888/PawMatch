# Tasks — index

> Implementation plan, phased. Read by phase, not all at once.

**One session per task.** Open the current phase file, work the next unchecked task, ship it, end the session. Don't reach forward.

| File | Estimated time | Goal |
|---|---|---|
| `phase-0.md` | ~6 hours | Project setup, repos, scaffolding, deployment, CI |
| `phase-1.md` | ~25 hours | Foundation: SPCA scraper, swipe stack, anonymous flow |
| `phase-2.md` | ~25 hours | Discovery: more scrapers, LLM extraction, profiles, match scoring |
| `phase-3.md` | ~25 hours | The watch: auth, saved searches, push notifications, Pulse |
| `phase-4.md` | ~20 hours | Trust & retention: stories, share pages, post-handoff check-ins |
| `phase-5.md` | ~15 hours | Polish: admin, PDPA, accessibility, ops, launch prep |
| `phase-6.md` | TBD | v1.5 features driven by user feedback |

**Total to public launch:** ~80 hours of focused engineering.

## How to read

- A "weekend" assumes ~8 hours of focused work.
- Each phase ends with a **ship gate** with measurable exit criteria.
- Each task has acceptance criteria — not done unless those are met.
- Order within a phase matters. Skipping ahead breaks dependencies.
- If a phase runs long, **cut features inside the phase, don't slip the phase goal.**
- After each merge, run the per-phase smoke test mentally: home loads, swipe works, detail loads, View on Shelter opens, no console errors.

## Working principles

- **Ship Phase 1 in 3 weekends, even if rough.** Real users on a rough product teaches more than polishing in private.
- **One phase at a time.** No reaching forward.
- **Cut before adding.** If a phase runs long, cut features, don't slip the goal.
- **Talk to users between phases.** Every ship gate has measurable exit criteria. Don't skip them.
- **Each phase is shippable.** If life intervenes after Phase 2, the app is still useful and live.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SPCA blocks scraping or has a bot wall | Medium | High | Phase 1 task 1.3 validates first; if blocked, that's a project-level decision (try another shelter, request permission, or stop) |
| Match score sub-functions feel wrong in practice | Medium | High | Phase 2 ship gate requires human validation against 10 real pets per tester |
| Shelter cease-and-desist | Low | Medium | Source `active=false` flag deactivates a shelter in seconds |
| iOS push limitation kills retention | Medium | Medium | Email + in-app fallback; install walkthrough; designed degradation |
| LLM costs spike | Low | Medium | Daily cap at wrapper; alerts at 80% |
| Inngest free tier exceeded | Low | Medium | Possibly Yours feed budget covers up to 5K active users; upgrade or batch-generate at scale |
| Solo developer burnout | High | High | Each phase is independently shippable |
| Vercel/Supabase free tier exceeded | Low | Low | Cost monitoring; expected $5–15/mo |
| Status detection misclassifies adopted pets | Medium | Medium | Conservative bias (default `available` when uncertain); manual override; per-shelter fixtures |

## Kill switches

For when things go wrong:

- **Disable a shelter:** `UPDATE shelters SET active=false WHERE id='spca'` — scraper skips, UI hides their pets within minutes.
- **Disable LLM extraction:** set `LLM_DISABLED=true` env var; pets serve with raw fields only.
- **Disable notifications:** disable Inngest functions in dashboard; existing data unaffected.
- **Vercel rollback:** one-click in Vercel dashboard.
- **Full app maintenance mode:** flip a feature flag → all routes return a maintenance page.
- **Account deletion runaway:** rate-limited at 1/user/24h; admin can pause `DELETE /api/auth/account` via env flag.
