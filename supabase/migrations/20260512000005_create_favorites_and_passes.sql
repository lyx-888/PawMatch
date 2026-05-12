-- Migration 010: favorites and passes tables per docs/requirements §5.2
--
-- Phase 2.8. Anonymous users keep favorites/passes in localStorage; once
-- an account is created (Phase 3) the migrate endpoint moves them here.
--
--   public.favorites  per-(user, pet) save with optional `note_text` (≤ 500
--                     chars, plain text). UI saves anonymous notes to
--                     localStorage; authenticated users PATCH this table.
--   public.passes     per-(user, pet) reject; no note, used to filter the
--                     swipe stack and prevent re-suggestion.
--
-- RLS scopes both tables to the owning user. Note_text is plain text only;
-- the API layer strips HTML before insert so we never need to escape on read.

create table public.favorites (
  user_id                uuid not null references public.users(id) on delete cascade,
  pet_id                 uuid not null references public.pets(id) on delete cascade,
  created_at             timestamptz not null default now(),
  status_when_favorited  text,
  note_text              text check (note_text is null or length(note_text) <= 500),
  primary key (user_id, pet_id)
);

create index favorites_pet_id_idx on public.favorites(pet_id);
create index favorites_user_created_idx on public.favorites(user_id, created_at desc);

alter table public.favorites enable row level security;

create policy favorites_select_own on public.favorites
  for select using (auth.uid() = user_id);

create policy favorites_insert_own on public.favorites
  for insert with check (auth.uid() = user_id);

create policy favorites_update_own on public.favorites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy favorites_delete_own on public.favorites
  for delete using (auth.uid() = user_id);

create table public.passes (
  user_id     uuid not null references public.users(id) on delete cascade,
  pet_id      uuid not null references public.pets(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, pet_id)
);

create index passes_user_created_idx on public.passes(user_id, created_at desc);

alter table public.passes enable row level security;

create policy passes_select_own on public.passes
  for select using (auth.uid() = user_id);

create policy passes_insert_own on public.passes
  for insert with check (auth.uid() = user_id);

create policy passes_delete_own on public.passes
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.favorites, public.passes to service_role;
grant select, insert, update, delete on public.favorites, public.passes to authenticated;
