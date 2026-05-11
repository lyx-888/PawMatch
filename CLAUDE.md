# CLAUDE.md — PawMatch SG

> Auto-loaded by Claude Code every session. Keep this file short. Detail lives in `docs/`.

**Project:** Singapore-only pet adoption companion. Aggregates listings from major SG shelters via daily scraping, scores them against user lifestyle profiles, notifies users when matching pets appear.

**Core principle:** the user's job is finding the right pet. Anything that doesn't serve that should not be added.

---

## Where to find things

| If you need... | Read... |
|---|---|
| What the product does, features, screens, flows | `docs/requirements/` (split by section) |
| What to build right now and in what order | `docs/tasks/phase-N.md` for the current phase |
| Architectural decisions and rationale | `docs/architecture.md` |
| Code conventions, patterns, examples | `docs/patterns.md` |
| Coding standards (TS, Python, DB rules) | `docs/coding-standards.md` |
| Operations runbooks | `ops/` |

**Do not load whole files when a section will do.** A task referencing "requirements §2.3" means open `docs/requirements/02-features.md` and find §2.3, not load the entire requirements tree.

---

## Architecture in one paragraph

Two services share one Postgres database (Supabase, ap-southeast-1). `web/` is Next.js 14 App Router + TypeScript strict + Tailwind, serving the PWA, admin UI, and all client-facing API routes. `scrapers/` is a standalone Python service that runs on a schedule, scrapes shelter sites, performs LLM extraction via Claude Haiku, and writes to Postgres. The web app and scrapers communicate **only through the database** — never directly. Background jobs run on Inngest (match score recompute, notifications, daily picks). Hosted on Vercel + Fly.io. See `docs/architecture.md` for full rationale.

---

## Anonymous users are first-class

The app must work fully (swipe, favorite, filter, save profile drafts) without an account. Use a UUID stored in localStorage. On account creation, migrate via `POST /api/auth/migrate` (idempotent). **Never block the swipe behind auth.**

---

## Schema migration coordination

Shared database means schema changes must be backwards-compatible across one release:

1. Migrations are **additive only** — never drop or rename in the same migration as code requiring it.
2. Apply migration first, then deploy scrapers, then deploy web app.
3. Drop old columns/tables in a follow-up migration once both services confirmed working.

Breaking changes that can't be split need coordinated downtime — see `ops/migration-runbook.md`.

---

## Pre-approved dependencies

Use without asking. Anything else: propose first.

**Web:** `next`, `react`, `typescript`, `tailwindcss`, `clsx`, `tailwind-merge`, `framer-motion`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`, `@anthropic-ai/sdk`, `inngest`, `resend`, `web-push`, `@sentry/nextjs`, `posthog-js` or Plausible client. Dev: `vitest`, `@testing-library/react`, `@playwright/test`, `eslint`, `prettier`, `husky`, `lint-staged`.

**Scrapers:** `httpx`, `selectolax`, `playwright`, `pydantic`, `supabase`, `anthropic`, `imagehash`. Dev: `pytest`, `ruff`, `mypy`, `pre-commit`.

---

## Folder structure (top-level only)

```
pawmatch-sg/
├── CLAUDE.md                      # this file
├── docs/                          # specs and standards
│   ├── requirements/              # what to build (split by section)
│   ├── tasks/                     # how and when to build (split by phase)
│   ├── architecture.md
│   ├── patterns.md
│   └── coding-standards.md
├── ops/                           # runbooks
├── web/                           # Next.js
├── scrapers/                      # Python
└── supabase/migrations/
```

Naming: `kebab-case` routes/assets, `PascalCase` components, `snake_case` Python and DB columns. Booleans `is_*`/`has_*`/`can_*`. Timestamps `*_at`, UTC in storage, SGT only at display.

Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).

---

## Coding rules (essentials only — full version in `docs/coding-standards.md`)

- TypeScript strict, no `any`. Allowed escape hatches: `as unknown as T` and `// @ts-expect-error` with inline comment.
- Server Components by default; `"use client"` only when interactivity demands it.
- Validate at API boundaries with Zod. Re-validate on the server even if the client validated.
- API route handlers thin — push logic into `lib/`.
- All LLM calls through one wrapper. Always structured outputs. Always cached by `sha256(input + schema_version)`.
- LLM output never reaches the user without going through Postgres first.
- Match scores precomputed, never per-request.
- PDPA: never log PII. Account deletion fully removes user data within 24h.
- All user-facing strings via `t()` from Phase 2 onward. Phase 1 may use literals; migrate them in Phase 2 task 2.12.

---

## Testing

- **Unit tests required** for `lib/matching/`, `lib/notifications/`, filter logic, anon-to-user migration. 80% coverage target on these modules.
- LLM wrapper tested with mocked responses. Real-API smoke tests run nightly, not in PR CI.
- E2E (Playwright): anonymous swipe → 5 swipes → profile prompt → favorite → account create; saved search → notification → tap-through.
- Pre-commit: lint + typecheck + format. Pre-push: full test suite.

---

## What requires explicit permission

- Adding dependencies outside the pre-approved list.
- Refactoring adjacent code (stay in your lane).
- Database schema changes beyond what the task requires.
- Touching deployment, CI, or infrastructure config.
- Changing linter, formatter, or test rules.
- Introducing new architectural patterns (state management, ORMs, etc.).
- Modifying `docs/requirements/*` directly — propose changes, don't apply silently.

## What's always permitted

- Reading any file in the repo.
- Asking clarifying questions.
- Pointing out problems with the spec or task as written.
- Suggesting alternatives with reasoning.
- Refusing to do something that violates these rules.

## Escalation — never silent, even with general permission

- Anything that could cause data loss (migrations dropping columns, deletion logic).
- Anything touching PDPA-sensitive paths (deletion, export, anonymization).
- Anything affecting cost (new API integrations, new background jobs, increased notification frequency).
- Anything changing match scoring in a way that affects existing users.
- Anything affecting shelter-facing behavior.

For these: propose, wait for approval, then implement.

---

## Working rhythm

Each task in `docs/tasks/phase-N.md` is one focused session.

1. Read `CLAUDE.md` (this file — auto-loaded).
2. Read the specific task in the current phase file.
3. Read the relevant requirements section (by section, not whole files).
4. Read any code files you'll modify before editing.
5. Implement the smallest version that works end-to-end.
6. Add tests per the rules above.
7. End the session with a handoff: what was done, what's left, what to review.

If a task is ambiguous, ask before guessing. A 30-second clarification beats a wrong implementation.

---

## The single most important rule

This app exists to help shelter pets in Singapore find homes. When trade-offs are unclear, choose the option that gets more pets into more good homes.
