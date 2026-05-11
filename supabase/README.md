# supabase/

CLI-managed schema migrations. Shared by [web/](../web/) and [scrapers/](../scrapers/) — both services talk to the same Postgres.

## Local development setup

> Status: wired up. `supabase/config.toml` is committed; first migration ships in Phase 1.

Prerequisites:
- **Docker Desktop** — https://www.docker.com/products/docker-desktop/ (must be running before `supabase start`)
- **Supabase CLI** — on Windows install [Scoop](https://scoop.sh), then `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase`. On macOS use `brew install supabase/tap/supabase`. Other platforms: download from https://github.com/supabase/cli/releases.

Then from the repo root:

```bash
supabase start         # spins up local Postgres + Studio via Docker (first run pulls ~15 images, 3-8 min)
supabase login         # browser auth, one-time per machine — only needed for cloud ops below
supabase link --project-ref pzyixlsmjqzgmtfivjad   # link to the cloud project
supabase db push       # apply local migrations to the cloud project
supabase stop          # tear down local containers
```

`supabase init` already ran — `config.toml` is committed. Don't re-run it.

After `supabase start`, services run on:
- **Studio** http://127.0.0.1:54323 (Postgres GUI)
- **API** http://127.0.0.1:54321 (REST, GraphQL, Auth, Storage)
- **Postgres** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Mailpit** http://127.0.0.1:54324 (captures local auth emails)

Run `supabase status` any time to print the current URLs and the local publishable/secret API keys (these are shared defaults — never use them outside local dev).

## Migration rules (from [CLAUDE.md](../CLAUDE.md))

Shared database means schema changes must be backwards-compatible across one release:

1. Migrations are **additive only** — never drop or rename in the same migration as code requiring it.
2. Apply migration first, then deploy scrapers, then deploy web app.
3. Drop old columns/tables in a follow-up migration once both services confirmed working.

Breaking changes that can't be split need coordinated downtime — see [ops/migration-runbook.md](../ops/migration-runbook.md).

## Naming

`YYYYMMDDHHMMSS_description.sql`, e.g. `20260512143000_create_pets_table.sql`. The CLI generates timestamps when you run `supabase migration new <name>`.
