# PawMatch SG

> *"Singapore's shelter pets, in one place — and we'll tell you when yours shows up."*

A Singapore-only pet adoption companion. Aggregates listings from major SG shelters via daily scraping, scores them against user lifestyle profiles, and notifies users when matching pets appear.

## Repo layout

```
pawmatch-sg/
├── CLAUDE.md                      # auto-loaded by Claude Code each session
├── docs/
│   ├── requirements/              # what to build (split by section)
│   ├── tasks/                     # how & when to build (split by phase)
│   ├── architecture.md            # why the system is shaped this way
│   ├── patterns.md                # code patterns to copy
│   └── coding-standards.md        # detailed rules
├── ops/                           # runbooks (created in Phase 0/5)
├── web/                           # Next.js (created in Phase 0)
├── scrapers/                      # Python service (created in Phase 0)
└── supabase/migrations/           # DB schema
```

## Getting started

### Reading order

1. **Read [CLAUDE.md](CLAUDE.md)** — the session preamble.
2. **Read [docs/requirements/README.md](docs/requirements/README.md)** — index to product spec.
3. **Read [docs/tasks/README.md](docs/tasks/README.md)** — index to the implementation plan.
4. **Start with Phase 0** in [docs/tasks/phase-0.md](docs/tasks/phase-0.md).

### Local setup (after cloning)

Prerequisites:
- Node 22 LTS or 24 (24 recommended)
- Python 3.11+ (3.13 recommended)
- `uv` — `py -m pip install --user uv`
- Docker Desktop + Supabase CLI (only needed once Phase 1 starts touching the schema)

```bash
# Root — installs husky for git hooks
npm install

# Web app
cd web
cp .env.example .env.local   # then fill in Supabase keys
npm install
npm run dev                  # http://localhost:3000

# Scrapers (in a separate terminal)
cd scrapers
cp .env.example .env
py -m uv sync
py -m uv run pytest
```

### Running checks

```bash
# Web: lint + typecheck + test + build
cd web && npm run lint && npm run typecheck && npm run test && npm run build

# Scrapers: ruff + mypy + pytest
cd scrapers && py -m uv run ruff check && py -m uv run mypy src && py -m uv run pytest
```

## Working with AI coding assistants

Use one focused session per task. Don't dump all docs into one prompt. Each task in `docs/tasks/phase-N.md` lists which requirement sections to read for context.

See `CLAUDE.md` for session conventions.

## Status

Pre-implementation. Spec is v1.1 (2026-05-10), restructured for efficient session-by-session building.
