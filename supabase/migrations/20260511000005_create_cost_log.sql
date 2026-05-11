-- Migration 005: cost_log
--
-- Daily roll-up of paid-service usage. LLM wrapper increments llm_calls and
-- llm_cost_usd as it goes; the other columns are filled by a daily cron job
-- pulling from Supabase/Vercel/Inngest stats.

create table cost_log (
  date date primary key,
  llm_calls int not null default 0,
  llm_cost_usd numeric(10,4) not null default 0,
  vercel_bandwidth_gb numeric(10,2),
  supabase_db_size_mb numeric(10,2),
  inngest_events int not null default 0
);
