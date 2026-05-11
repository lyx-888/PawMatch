# Phase 0 — Project setup

> ~6 hours. See `README.md` for the full task index and working principles.

**Goal:** an empty but correctly-configured monorepo, deployed and ready to receive code.

**Ship gate:** anonymous user can visit a deployed Vercel URL and see a "hello world" page; CI is green on a sample commit.

### 0.1 Repository

- [ ] Create GitHub repo `pawmatch-sg`, private to start.
- [ ] Add `README.md` with description and setup placeholder.
- [ ] Commit `requirements.md`, `CLAUDE.md`, `tasks.md` to root.
- [ ] Add `.gitignore` covering Node, Python, env files, OS artifacts.
- [ ] Add license file.
- **Acceptance:** `git clone` produces a working starting point; documentation files visible at root.

### 0.2 Web app scaffolding

- [ ] In `web/`, init Next.js 14 with TypeScript, App Router, Tailwind, ESLint.
- [ ] Configure `tsconfig.json` strict mode (no implicit any, strict null checks).
- [ ] Add Prettier config + `eslint-plugin-tailwindcss`.
- [ ] Add `husky` + `lint-staged` for pre-commit format/lint.
- [ ] Add Vitest with a sample passing test.
- [ ] Add `.env.example` documenting all env vars used.
- **Acceptance:** `npm run lint && npm run typecheck && npm run test && npm run build` all pass.

### 0.3 Scraper scaffolding

- [ ] In `scrapers/`, init Python 3.11+ with `pyproject.toml` (use `uv` or `poetry`).
- [ ] Add ruff, mypy, pytest configs.
- [ ] Add `pre-commit` hook config.
- [ ] Create directory structure: `src/sources/`, `src/utils/`, `tests/`, `tests/fixtures/`.
- [ ] Add a sample `hello world` scraper module and passing test.
- **Acceptance:** `ruff check && mypy src/ && pytest` all pass.

### 0.4 Database setup

- [ ] Create Supabase project (region: ap-southeast-1).
- [ ] Add `supabase/migrations/` directory with CLI-managed migrations.
- [ ] Install Supabase CLI locally; document local dev setup in README.
- [ ] Confirm local Supabase via Docker works for dev.
- **Acceptance:** `supabase start` runs locally; remote project accessible with anon key.

### 0.5 Deployment

- [ ] Connect GitHub repo to Vercel for `web/`.
- [ ] Provision a Hetzner or Fly.io VM for scrapers (don't deploy code, just have it ready).
- [ ] Set environment variables in Vercel: Supabase URL, anon key, service role.
- [ ] Deploy the empty Next.js app, confirm it loads.
- **Acceptance:** deployed Vercel URL serves the default Next.js page over HTTPS.

### 0.6 CI

- [ ] Add `.github/workflows/web.yml`: lint, typecheck, test, build on PR.
- [ ] Add `.github/workflows/scrapers.yml`: ruff, mypy, pytest on PR.
- [ ] Configure branch protection on `main` to require green CI.
- **Acceptance:** opening a PR triggers all checks; merging is blocked if any fail.

### 0.7 Operational readiness

- [ ] Add `ops/` directory with placeholders: `disaster-recovery.md`, `incident-response.md`, `migration-runbook.md`, `pr-review-checklist.md`.
- [ ] Set up Sentry project (free tier), add DSN to env vars.
- [ ] Set up UptimeRobot to ping the deploy URL (placeholder — will repoint at `/api/health` later).
- **Acceptance:** Sentry receives a test error from the deployed app.

### 0.8 Third-party account setup

These are needed for later phases. Set up now so we're not blocked when we need them.

- [ ] Sign up for Anthropic API; provision a key with billing limit set to $20/mo. Store in 1Password vault.
- [ ] Sign up for Resend; verify project domain (or pawmatch.sg if claimed) for email sending. Configure SPF/DKIM/DMARC records.
- [ ] Sign up for Inngest; create a project, generate event and signing keys.
- [ ] Sign up for Plausible (or PostHog) for analytics.
- [ ] Generate VAPID keys for Web Push (`npx web-push generate-vapid-keys`).
- [ ] Add all keys to Vercel and Fly.io env, plus the shared 1Password vault.
- **Acceptance:** every key has a verified working test (curl Anthropic API, send a test email, fire a test Inngest event, see analytics in dashboard).

### 0.9 Phase 0 ship gate

- [ ] Confirm a fresh `git clone` → `npm install` → `supabase start` → `npm run dev` works for a new contributor (or you on a fresh machine).
- [ ] Confirm CI is green on the latest commit.
- [ ] Confirm deployed URL loads.
- [ ] Confirm all third-party services tested and working.
- [ ] **Exit criteria:** all four above hold true. If not, do not proceed.

---

