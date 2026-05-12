-- Migration 012: daily_picks + active-user tracking per docs/requirements §2.4
--
-- Phase 2.11. "Possibly Yours" generates 5 personalised pets per active
-- user every morning at 06:00 SGT. The generator queries match_scores
-- (Phase 2.6b) joined with the favorites/passes tables (Phase 2.8) to
-- avoid resurfacing pets the user has already swiped.
--
-- Active-user gate: `users.last_active_at` is set by the auth middleware
-- on every authenticated request (wired in Phase 3). Cost is bounded
-- because inactive users are skipped — at 5K active users × 1 cron run
-- per day = ~5K Inngest events/month per spec.

alter table public.users
  add column if not exists last_active_at timestamptz;

create index if not exists users_last_active_idx
  on public.users(last_active_at)
  where last_active_at is not null;

create table public.daily_picks (
  user_id       uuid not null references public.users(id) on delete cascade,
  date          date not null,
  pet_ids       uuid[] not null,
  generated_at  timestamptz not null default now(),
  primary key (user_id, date)
);

create index daily_picks_user_date_idx on public.daily_picks(user_id, date desc);

alter table public.daily_picks enable row level security;

create policy daily_picks_select_own on public.daily_picks
  for select using (auth.uid() = user_id);

grant select on public.daily_picks to authenticated;
grant select, insert, update, delete on public.daily_picks to service_role;
