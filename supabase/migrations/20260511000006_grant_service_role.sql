-- Migration 006: explicit service_role grants on Phase 1 tables
--
-- The scraper writes via the service_role JWT, which expects table-level
-- privileges in public. On this project Supabase's default privileges did not
-- include service_role for new public tables, so the first cron run failed
-- with 42501 "permission denied for table pets". This migration adds the
-- missing grants and sets ALTER DEFAULT PRIVILEGES so future tables in public
-- pick them up automatically.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.shelters,
  public.pets,
  public.pet_status_history,
  public.scraper_runs,
  public.cost_log
to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
