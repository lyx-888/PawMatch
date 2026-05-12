-- Migration 011: match_scores + recompute_queue per docs/requirements §5.2
--
-- Phase 2.6b. Server-side computed match scores for authenticated users.
-- Anonymous users continue to score client-side in lib/matching/use-score.ts.
--
--   public.match_scores      precomputed (user, pet) → tier+score+reasons.
--                            `weights_version` is the score()'s WEIGHTS_VERSION
--                            constant; stored as text so we can A/B test
--                            scoring changes without nuking history.
--   public.recompute_queue   work queue drained by an Inngest cron. Triggers
--                            on profiles/pets writes enqueue jobs here. A
--                            partial unique index coalesces concurrent
--                            enqueues of the same target while still pending,
--                            so the queue size is bounded.

create table public.match_scores (
  user_id          uuid not null references public.users(id) on delete cascade,
  pet_id           uuid not null references public.pets(id) on delete cascade,
  score            int not null check (score between 0 and 100),
  tier             text not null check (tier in ('great', 'good', 'stretch', 'hard_fail')),
  reasons_json     jsonb not null,
  weights_version  text not null,
  stale            boolean not null default false,
  computed_at      timestamptz not null default now(),
  primary key (user_id, pet_id)
);

create index match_scores_user_tier_idx
  on public.match_scores(user_id, tier, score desc)
  where stale = false;

create index match_scores_pet_idx on public.match_scores(pet_id);

alter table public.match_scores enable row level security;

create policy match_scores_select_own on public.match_scores
  for select using (auth.uid() = user_id);

grant select on public.match_scores to authenticated;
grant select, insert, update, delete on public.match_scores to service_role;

-- --- recompute_queue ------------------------------------------------------

create table public.recompute_queue (
  id            bigserial primary key,
  kind          text not null check (kind in ('user', 'pet', 'all')),
  -- user_id when kind='user', pet_id when kind='pet', null for 'all'.
  target_id     uuid,
  enqueued_at   timestamptz not null default now(),
  picked_up_at  timestamptz
);

-- Pending-only index — keeps the hot path (drain-cron lookup) small.
create index recompute_queue_pending_idx
  on public.recompute_queue(enqueued_at)
  where picked_up_at is null;

-- Coalesce duplicate enqueues: while a (kind, target_id) row is still
-- pending, further enqueues become no-ops. This bounds queue size during
-- a bulk scraper run and avoids redundant recomputes.
create unique index recompute_queue_pending_unique_idx
  on public.recompute_queue(kind, target_id)
  where picked_up_at is null;

-- 'all' rows have null target_id; the unique index above treats nulls as
-- distinct, so multiple 'all' rows can coexist. We don't want that — use a
-- separate index keyed on `kind` alone for the all-rows case.
create unique index recompute_queue_pending_all_idx
  on public.recompute_queue(kind)
  where picked_up_at is null and target_id is null;

grant select, insert, update, delete on public.recompute_queue to service_role;
grant usage, select on sequence public.recompute_queue_id_seq to service_role;

-- --- triggers -------------------------------------------------------------

create or replace function public.enqueue_recompute(p_kind text, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.recompute_queue (kind, target_id)
  values (p_kind, p_target_id)
  on conflict do nothing;
end;
$$;

-- Profile changes that affect scoring → enqueue a per-user recompute.
-- completion_pct and updated_at are derived fields, so flipping them alone
-- doesn't dirty the score.
create or replace function public.profiles_enqueue_recompute()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.housing_type        is distinct from old.housing_type
    or new.has_kids         is distinct from old.has_kids
    or new.kid_ages         is distinct from old.kid_ages
    or new.other_pets       is distinct from old.other_pets
    or new.mesh_status      is distinct from old.mesh_status
    or new.work_pattern     is distinct from old.work_pattern
    or new.hours_alone      is distinct from old.hours_alone
    or new.experience       is distinct from old.experience
    or new.activity_level   is distinct from old.activity_level
    or new.budget_tier      is distinct from old.budget_tier
    or new.special_needs_ok is distinct from old.special_needs_ok
    or new.species_pref     is distinct from old.species_pref
  ) then
    perform public.enqueue_recompute('user', new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_recompute_trigger on public.profiles;
create trigger profiles_recompute_trigger
  after update on public.profiles
  for each row execute function public.profiles_enqueue_recompute();

-- Pet inserts/updates → enqueue a per-pet recompute. Filtered to the
-- columns the matching engine actually reads so the daily scraper's idle
-- UPSERTs (no field changes) don't churn the queue.
create or replace function public.pets_enqueue_recompute()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_recompute('pet', new.id);
  elsif tg_op = 'UPDATE' and (
    new.species       is distinct from old.species
    or new.size       is distinct from old.size
    or new.weight_kg  is distinct from old.weight_kg
    or new.height_cm  is distinct from old.height_cm
    or new.hdb_approved is distinct from old.hdb_approved
    or new.energy_level is distinct from old.energy_level
    or new.tags       is distinct from old.tags
    or new.status     is distinct from old.status
  ) then
    perform public.enqueue_recompute('pet', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists pets_recompute_trigger on public.pets;
create trigger pets_recompute_trigger
  after insert or update on public.pets
  for each row execute function public.pets_enqueue_recompute();

-- --- queue drain RPC ------------------------------------------------------
--
-- The Inngest drain cron calls this to atomically claim a batch of pending
-- jobs. Uses FOR UPDATE SKIP LOCKED so two concurrent drains never grab the
-- same row. Returns the claimed rows; the caller deletes them after
-- successful fan-out.
create or replace function public.recompute_queue_claim(batch_size int)
returns table (id bigint, kind text, target_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select rq.id
    from public.recompute_queue rq
    where rq.picked_up_at is null
    order by rq.enqueued_at
    for update skip locked
    limit batch_size
  )
  update public.recompute_queue rq
    set picked_up_at = now()
    from claimed
    where rq.id = claimed.id
    returning rq.id, rq.kind, rq.target_id;
end;
$$;

grant execute on function public.recompute_queue_claim(int) to service_role;
