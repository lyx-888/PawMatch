# Coding Standards

> Detailed coding rules. The summary in `CLAUDE.md` covers daily work. Read this when working on cross-cutting changes or when in doubt.

---

## General

- **Read `docs/requirements/` and the relevant section of `docs/tasks/phase-N.md` before writing code.** If a task is ambiguous, ask before guessing.
- **No premature abstraction.** Write the concrete thing first. Extract patterns only after they appear 3+ times.
- **No dead code.** If a function isn't called, delete it. Don't leave commented-out blocks.
- **Comments explain why, not what.** The code shows what; comments capture context the code can't.
- **Small, focused PRs.** One concern per change. If "and also" appears in a commit message, split it.

---

## TypeScript / Next.js

- Strict mode on. No `any`.
- Allowed escape hatches, with inline comment explaining why each time:
  - `as unknown as T` — only for documented type-system limitations.
  - `// @ts-expect-error <reason>` — never `@ts-ignore`.
- Server Components by default. Add `"use client"` only when needed.
- Always handle loading and error states. Never assume data is present.
- Validate at API boundaries with Zod. Re-validate on the server even if the client validated.
- Keep API route handlers thin. Push logic into `lib/`.
- All user-facing strings via `t()` from Phase 2 onward. Phase 1 may use literals; migrate them in Phase 2 task 2.12.
- No `Object` or `Function` types. No empty interfaces.

---

## Python (scrapers)

- Type hints on all functions. mypy strict.
- One scraper per file in `sources/`. Each exports `scrape() -> list[PetRecord]`.
- No shared mutable state between scrapers.
- All HTTP requests via the shared `base.py` client (user agent, timeout, retries, rate limit).
- Respect `robots.txt` and shelter site load.
- Scrapers idempotent — running twice produces the same data.
- Wrap each scraper run in try/except. One failure must never block others.
- Use Pydantic for `PetRecord` to get validation for free.

---

## Database

- Migrations forward-only **once merged to main**. Before merge, editing the in-progress migration is fine. After: write a new one.
- Every table has `created_at`. Mutable tables also have `updated_at` via trigger.
- Indexes on every foreign key, every column used in filters or sorts.
- Use Postgres features (jsonb, arrays, GIN) when they solve a real problem.
- Row-level security on all tables containing user data. Test policies in dev.
- Migrations follow the additive-only rule from `CLAUDE.md`.
- Service roles defined per `docs/requirements/05-technical.md` §5.2.1.

---

## LLM extraction

- All LLM calls go through one wrapper (`lib/llm.ts` or `extraction.py`).
- Always use structured outputs (JSON schema). Never parse free-form text.
- Cache by hash of input + schema version. Bump schema version on prompt change.
- Each extraction returns a confidence per field; low-confidence handled per `docs/requirements/02-features.md` §2.1.4.
- LLM output never reaches the user without going through Postgres. The DB is the source of truth.
- Daily spend cap enforced at the wrapper. Cap exceeded → return cached or null, never bypass.
- Log every call with cost for the daily report.

---

## Performance

- Match scores precomputed, never per-request.
- Pet list endpoints paginated, default 20.
- Photos served via `next/image` with appropriate cache headers.
- Swipe stack preloads next 5 cards' data and primary photo.
- Database queries reviewed for N+1 — use joins or batch loads.

---

## Privacy

- PDPA is real. Never log PII to error trackers (configure Sentry scrubbing).
- Lifestyle profile data per-user only. Never aggregated and shared with shelters except via explicit user-initiated action.
- Account deletion fully removes user data within 24h.
- Anonymous users have no PII collected — UUID only, in localStorage.

---

## Error handling

- User-facing errors specific and actionable. Not "Something went wrong" — say what failed.
- Server errors logged with debug context, scrubbed of PII.
- Never let a single shelter's data issue break the entire feed.
- Show offline-aware errors (service worker can detect).

---

## Accessibility

- All interactive elements keyboard-navigable.
- Swipe actions always have button equivalents.
- Color contrast WCAG AA minimum.
- Real alt text on every photo.
- Respect `prefers-reduced-motion`.
- Built in from Phase 1, not retrofitted in Phase 5.

---

## Rate limiting

- All write endpoints rate-limited per `docs/requirements/02-features.md` §2.14.
- Use Vercel middleware with IP-based tracking for v1. Move to Upstash Redis if scale demands.
- Return 429 with `Retry-After` header.

---

## Testing details

### Web

- **Linter:** ESLint with Next.js config + `eslint-plugin-tailwindcss`.
- **Formatter:** Prettier. Format on save.
- **Type check:** `tsc --noEmit` on every commit.
- **Unit tests:** Vitest for `lib/`. Required for:
  - Match scoring (`lib/matching/`) — every change to weights or templates needs tests.
  - Notification dispatch logic.
  - Filter logic.
  - Anonymous-to-registered migration (idempotency).
- **Component tests:** Testing Library for components with non-trivial interaction.
- **E2E tests:** Playwright for critical flows.
- **Coverage target:** 80% for `lib/matching/` and `lib/notifications/`. No global threshold.

Run before commit:

```bash
cd web && npm run lint && npm run typecheck && npm run test
```

### LLM-adjacent code

Match score reasons use templates with deterministic interpolation — fully testable. The LLM extraction wrapper is tested with mocked OpenAI responses; never hit the real API in tests. Real-API smoke tests live in a separate `npm run test:integration` that runs nightly, not on PRs.

### Scrapers

- **Linter:** ruff. **Formatter:** ruff format. **Type check:** mypy strict.
- **Unit tests:** pytest. Each scraper has fixture-based tests against saved HTML snapshots.
- **Integration tests:** runner-level test using a test Postgres instance.
- **No live shelter site hits in unit tests.** Live tests run nightly via separate CI job.

```bash
cd scrapers && ruff check . && ruff format --check . && mypy src/ && pytest
```

### Database

- Migrations tested in CI against clean Postgres.
- RLS policies tested with multiple user contexts.

### CI

GitHub Actions on every PR:
1. Web: lint, typecheck, test, build.
2. Scrapers: lint, typecheck, test.
3. Migration check: apply migrations to clean Postgres.
4. E2E: Playwright suite against preview deployment.
5. Bundle size check: warn if bundle grows > 10% vs main.

Branch protection on `main`: no merge without all green.

### Pre-commit hooks

`husky` + `lint-staged` for web; `pre-commit` for scrapers. Format and lint changed files automatically. Hooks must finish in < 5 seconds.

---

## Definition of done (per task)

A task in `docs/tasks/phase-N.md` is done when:

1. Code is written and works locally.
2. Tests added per the rules above.
3. CI green.
4. PR description references the task.
5. Reviewed (self-review or peer-review).
6. Documentation updated where the change affects setup, conventions, or product spec.
7. Deployed to preview and manually smoke-tested.

---

## Working without prior session context

A fresh AI session has no memory of prior conversations. When picking up mid-task:

- **Don't pretend continuity that isn't there.** If the user references "the swipe component we built," either find it in the codebase or ask.
- **Read the most recently changed files** in the area before assuming structure.
- **Check `git log` and recent PRs** if available — faster context dump than re-reading the whole codebase.
- **The docs are ground truth.** Anything contradicting `CLAUDE.md` / `docs/requirements/` / `docs/tasks/` is either an outdated file or a doc bug to flag.
