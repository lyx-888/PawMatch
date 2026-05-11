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
