-- Migration 009: users and profiles per docs/requirements §5.2
--
-- Phase 2.3. Two tables behind Supabase Auth, with RLS so a logged-in user
-- can only see and edit their own profile row.
--
--   public.users     mirrors auth.users with PawMatch-specific columns
--                    (account_status, push_subscription, ios_pwa_installed,
--                    is_admin, deleted_at).
--   public.profiles  the lifestyle answers used by the matching engine.
--                    Partial by design — every column nullable, the
--                    `completion_pct` trigger keeps a 0–100 score in sync.
--
-- Triggers chain new-account creation:
--   auth.users INSERT  -> public.users INSERT  -> public.profiles INSERT
-- so a freshly signed-up user always has both rows even before they answer
-- the first onboarding question.
--
-- completion_pct formula (kept simple so the matching engine's "< 60%
-- means essentials-only" rule has a clean mapping):
--   3 essentials (housing_type / has_kids / other_pets) -> 20 pts each
--   7 progressive (work_pattern / hours_alone / experience / activity_level /
--                  budget_tier / special_needs_ok / species_pref) -> the
--                  remaining 40 pts, split evenly (round-half-up).
-- Conditional fields (kid_ages, hdb_block_type, mesh_status) are excluded
-- from the count so users without kids / not on HDB / not interested in
-- cats can still reach 100.

-- --- users -----------------------------------------------------------------

create table public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text unique,
  account_status        text not null default 'registered'
                          check (account_status in ('registered', 'suspended', 'pending_deletion')),
  push_subscription     jsonb,
  ios_pwa_installed     boolean not null default false,
  is_admin              boolean not null default false,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index users_deleted_at_idx on public.users(deleted_at);

alter table public.users enable row level security;

-- Users see only their own row; service role bypasses RLS.
create policy users_select_own on public.users
  for select using (auth.uid() = id);

create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- INSERT is performed by the trigger below using `security definer`; no
-- direct user-facing INSERT policy is needed.

-- --- profiles --------------------------------------------------------------

create table public.profiles (
  user_id               uuid primary key references public.users(id) on delete cascade,
  housing_type          text check (housing_type in ('hdb', 'condo', 'landed', 'other')),
  hdb_block_type        text,
  mesh_status           text check (mesh_status in ('meshed', 'not_meshed', 'planning')),
  has_kids              boolean,
  kid_ages              int[] not null default '{}',
  other_pets            text check (other_pets in ('none', 'cats', 'dogs', 'both')),
  work_pattern          text check (work_pattern in ('wfh', 'hybrid', 'office', 'shift', 'other')),
  hours_alone           int check (hours_alone is null or (hours_alone >= 0 and hours_alone <= 24)),
  experience            text check (experience in ('first_time', 'some', 'experienced')),
  activity_level        text check (activity_level in ('sedentary', 'moderate', 'very_active')),
  budget_tier           text check (budget_tier in ('low', 'medium', 'high')),
  special_needs_ok      boolean,
  species_pref          text[] not null default '{}',
  completion_pct        int not null default 0 check (completion_pct between 0 and 100),
  updated_at            timestamptz not null default now(),
  -- An empty kid_ages array is fine; populated only when has_kids is true.
  -- Mirrors the data-model spec's intent without making has_kids=null block
  -- the row.
  check (has_kids is not false or kid_ages = '{}')
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- INSERT handled by trigger (see below); no public INSERT policy.

-- --- triggers --------------------------------------------------------------

-- Auto-create public.users for every auth.users row.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Auto-create profiles row whenever a public.users row appears.
create or replace function public.handle_new_public_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_public_user_created on public.users;
create trigger on_public_user_created
  after insert on public.users
  for each row execute function public.handle_new_public_user();

-- completion_pct: 60 from the three essentials (20 each), 40 from seven
-- progressive fields (≈5.7 each, distributed via round() so the function is
-- deterministic and integer-only).
create or replace function public.compute_profile_completion()
returns trigger
language plpgsql
as $$
declare
  essentials int := 0;
  progressive int := 0;
begin
  if new.housing_type is not null then essentials := essentials + 1; end if;
  if new.has_kids is not null then essentials := essentials + 1; end if;
  if new.other_pets is not null then essentials := essentials + 1; end if;

  if new.work_pattern is not null then progressive := progressive + 1; end if;
  if new.hours_alone is not null then progressive := progressive + 1; end if;
  if new.experience is not null then progressive := progressive + 1; end if;
  if new.activity_level is not null then progressive := progressive + 1; end if;
  if new.budget_tier is not null then progressive := progressive + 1; end if;
  if new.special_needs_ok is not null then progressive := progressive + 1; end if;
  if coalesce(array_length(new.species_pref, 1), 0) > 0 then
    progressive := progressive + 1;
  end if;

  new.completion_pct := least(
    100,
    essentials * 20 + round(progressive * 40.0 / 7)::int
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_completion on public.profiles;
create trigger profiles_set_completion
  before insert or update on public.profiles
  for each row execute function public.compute_profile_completion();

-- --- grants ----------------------------------------------------------------

-- Authenticated and anon users go through PostgREST -> RLS. The service
-- role still bypasses RLS but needs explicit grants per migration 006.
grant select, insert, update, delete on public.users, public.profiles
  to service_role;
grant select, update on public.users, public.profiles to authenticated;
