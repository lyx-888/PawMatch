# scrapers

Python service that scrapes Singapore shelter listings and writes to the shared Postgres database.

## Quick start

```bash
# From scrapers/
py -m uv sync              # install all deps into .venv
py -m uv run ruff check    # lint
py -m uv run mypy src      # typecheck
py -m uv run pytest        # tests
```

Or activate the venv directly: `.\.venv\Scripts\Activate.ps1` (Windows) then run `ruff`, `mypy`, `pytest` directly.

## Layout

```
src/
├── sources/    # one module per shelter (spca.py, causes.py, ...)
└── utils/      # shared helpers (db client, llm wrapper, image hashing)
tests/
└── fixtures/   # canned HTML snapshots per shelter for deterministic tests
```

The scraper service shares a Postgres database with the [web/](../web/) app, but they communicate **only through the database** — never directly. See [CLAUDE.md](../CLAUDE.md) "Architecture in one paragraph."

## Env vars

See [.env.example](.env.example) in this directory.

## Scheduled runs (free tier)

Daily scrape runs on GitHub Actions, defined in [`.github/workflows/scraper-run.yml`](../.github/workflows/scraper-run.yml):
- Cron: `0 19 * * *` UTC → **03:00 SGT**.
- Manual trigger: Actions → scraper-run → "Run workflow".

The job needs two repo secrets (Settings → Secrets and variables → Actions):
- `SCRAPER_SUPABASE_URL` — production Supabase URL.
- `SCRAPER_SUPABASE_SERVICE_ROLE_KEY` — `sb_secret_…` for the same project. Service role: bypasses RLS, never expose to the browser.

GitHub Actions Free includes 2,000 minutes/month for private repos and unlimited for public. A full scrape is ~4 minutes / day = ~120 minutes / month, well inside the limit.
