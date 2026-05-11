-- Migration 002: pets listings table
--
-- Schema per docs/requirements/data-model.sql. Pet records come from per-source
-- scrapers; (source, source_id) uniquely identifies a listing across re-scrapes.
-- photo_urls[0] is the primary photo.

create table pets (
  id uuid primary key default gen_random_uuid(),
  source text not null references shelters(id),
  source_id text not null,
  source_url text not null,
  name text not null,
  species text not null,
  breed text,
  sex text,
  age_months int check (age_months >= 0 and age_months < 600),
  size text check (size in ('small', 'medium', 'large')),
  weight_kg numeric(5,2),
  height_cm numeric(5,2),
  hdb_approved boolean,
  description text,
  photo_urls text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'available'
    check (status in ('available', 'pending', 'adopted', 'gone')),
  status_reason text,
  low_confidence_fields text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  scraped_at timestamptz not null default now(),
  unique (source, source_id)
);

create index pets_status_idx on pets(status);
create index pets_species_size_idx on pets(species, size);
create index pets_first_seen_idx on pets(first_seen_at desc);
create index pets_tags_gin on pets using gin(tags);
