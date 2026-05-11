# supabase/

CLI-managed schema migrations. Shared by [web/](../web/) and [scrapers/](../scrapers/) — both services talk to the same Postgres.

## Local development setup

> Status: not yet wired up. First migration ships in Phase 1.

Prerequisites:
- **Docker Desktop** — https://www.docker.com/products/docker-desktop/
- **Supabase CLI** — `scoop install supabase` *or* `npm install -g supabase` *or* download from https://github.com/supabase/cli/releases

Then from the repo root:

```bash
supabase init          # one-time, links this directory to the CLI
supabase login         # browser auth, one-time per machine
supabase link --project-ref pzyixlsmjqzgmtfivjad   # link to the cloud project
supabase start         # spins up local Postgres + Studio via Docker
supabase db push       # apply local migrations to the cloud project
```

## Migration rules (from [CLAUDE.md](../CLAUDE.md))

Shared database means schema changes must be backwards-compatible across one release:

1. Migrations are **additive only** — never drop or rename in the same migration as code requiring it.
2. Apply migration first, then deploy scrapers, then deploy web app.
3. Drop old columns/tables in a follow-up migration once both services confirmed working.

Breaking changes that can't be split need coordinated downtime — see [ops/migration-runbook.md](../ops/migration-runbook.md).

## Naming

`YYYYMMDDHHMMSS_description.sql`, e.g. `20260512143000_create_pets_table.sql`. The CLI generates timestamps when you run `supabase migration new <name>`.
