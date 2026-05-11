# Migration runbook

> Reference for every database schema change. Read before opening a migration PR.

## Default flow (backwards-compatible)

Per [CLAUDE.md](../CLAUDE.md) "Schema migration coordination":

1. Migration is **additive only**.
2. Order of deploys: **migration → scrapers → web app**.
3. Old columns/tables get dropped in a **follow-up migration**, once both services confirmed working on the new shape.

## Step-by-step

```bash
# 1. Author the migration
supabase migration new add_pets_table

# 2. Edit supabase/migrations/<timestamp>_add_pets_table.sql

# 3. Apply locally to verify
supabase db reset    # drops local db, replays all migrations

# 4. Run tests against the new schema
cd web && npm run test
cd scrapers && uv run pytest

# 5. Push to cloud (staging first if we have one; Phase 5 task)
supabase db push

# 6. Deploy scrapers (Fly) — they should tolerate both old and new schema during transition
# 7. Deploy web (Vercel auto-deploys main)

# 8. Confirm both services healthy → 24h soak → write the follow-up "drop old" migration
```

## When the change is NOT backwards-compatible

Examples: renaming a column both services read; changing a type that breaks parsing; adding a NOT NULL column with no default.

**Process:**
1. Add the new shape alongside the old (additive).
2. Migrate data in a separate step (background job, or manual SQL if small).
3. Deploy both services to read/write the new shape, fall back to old.
4. Once both deploys are stable, remove the fallback in a follow-up.
5. Finally drop the old shape.

This is the "expand → migrate → contract" pattern. Slow but safe.

## RLS reminders

- **Every new public-schema table starts with RLS enabled** (the auto-RLS event trigger handles this).
- Define policies in the migration that creates the table. Don't ship a table without policies — it'll be inaccessible to the `anon` role.
- For tables only the service role touches, the policy can be `using (false)` for anon — service role bypasses RLS.

## Rollback

Migrations are forward-only in Supabase CLI. To "roll back," write a new migration that reverses the change. Real recovery from a bad migration uses point-in-time restore (see [disaster-recovery.md](disaster-recovery.md)).
