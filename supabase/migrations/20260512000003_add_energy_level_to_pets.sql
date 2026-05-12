-- Migration 008: add energy_level to pets
--
-- Listed as an extractable attribute in docs/requirements/02-features.md
-- §2.1.4 but missing from the Phase 1 pets schema. Phase 2.2's LLM
-- extraction returns it; without this column the value would have no
-- place to land. Additive — nullable, no default change.

alter table pets
  add column energy_level text check (energy_level in ('low', 'medium', 'high'));
