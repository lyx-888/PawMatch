-- Migration 003: pet_status_history with auto-logging trigger
--
-- Every status change on pets is appended here. Used for adoption activity stats,
-- "was available 3d ago" debugging, and the per-pet audit trail.

create table pet_status_history (
  id bigserial primary key,
  pet_id uuid not null references pets(id) on delete cascade,
  status text not null,
  reason text,
  changed_at timestamptz not null default now()
);

create index pet_status_history_pet_idx on pet_status_history(pet_id, changed_at desc);

-- Log initial status when a pet row is first inserted, and any later transitions.
create or replace function log_pet_status_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into pet_status_history (pet_id, status, reason)
    values (new.id, new.status, new.status_reason);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into pet_status_history (pet_id, status, reason)
    values (new.id, new.status, new.status_reason);
  end if;
  return new;
end;
$$;

create trigger pets_status_history_trigger
  after insert or update of status on pets
  for each row
  execute function log_pet_status_change();
