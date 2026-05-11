-- Migration 004: scraper_runs health tracking
--
-- One row per scraper invocation. Powers /api/health, the admin dashboard, and
-- the last_scraped_at value on /api/sources. Per-source isolation: each shelter
-- gets its own row per run so a single failure doesn't poison the others.

create table scraper_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('running', 'success', 'failed')),
  pets_found int,
  pets_added int,
  pets_updated int,
  pets_marked_gone int,
  error_message text
);

create index scraper_runs_source_started_idx on scraper_runs(source, started_at desc);
