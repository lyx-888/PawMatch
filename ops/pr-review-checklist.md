# PR review checklist

> Self-review before requesting merge. Catch the common things.

## Always

- [ ] CI is green (lint + typecheck + test + build for the touched service).
- [ ] No `console.log` / `print()` left in production code paths.
- [ ] No secrets in the diff (`git diff` against `.env.example` patterns).
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- [ ] PR description names the user-visible change in one sentence.

## If touching DB schema

- [ ] Migration is additive (see [migration-runbook.md](migration-runbook.md)).
- [ ] RLS policies defined for any new public-schema table.
- [ ] No `DROP` in the same migration as code that requires the new shape.
- [ ] Tested locally via `supabase db reset` (Phase 1+).

## If touching match scoring

- [ ] Reasoning unchanged for existing pets (golden-test snapshot).
- [ ] If the formula changed, scores recompute via background job, not on request.
- [ ] Diff in sample scores for the 10 reference pets attached in PR description.

## If touching auth / anon migration

- [ ] `POST /api/auth/migrate` remains idempotent.
- [ ] No path silently blocks the swipe behind a sign-up wall.
- [ ] PDPA: deletion still removes user data within 24h target.

## If touching LLM wrapper or extraction

- [ ] Output cached by `sha256(input + schema_version)`.
- [ ] Structured output schema versioned; old cache invalidates on schema bump.
- [ ] Daily cost cap unchanged or explicitly raised with justification.

## If touching deploy / CI / infra

- [ ] User explicitly approved this (see [CLAUDE.md](../CLAUDE.md) "What requires explicit permission").
- [ ] Rollback path documented in the PR description.
