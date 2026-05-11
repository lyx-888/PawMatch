-- PawMatch SG — Data model reference
-- Extracted from docs/requirements/05-technical.md §5.2
-- This file is for reference; actual migrations live in supabase/migrations/

-- Reference data
shelters (
  id text primary key,
  name text not null,
  website text not null,
  contact_email text,
  verified_since date,
  blurb text,
  logo_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Listings
pets (
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
  photo_urls text[] default '{}',                     -- index 0 is primary
  tags text[] default '{}',
  status text not null default 'available'
    check (status in ('available', 'pending', 'adopted', 'gone')),
  status_reason text,
  low_confidence_fields text[] default '{}',
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  scraped_at timestamptz default now(),
  unique (source, source_id)
);
create index pets_status_idx on pets(status);
create index pets_species_size_idx on pets(species, size);
create index pets_first_seen_idx on pets(first_seen_at desc);
create index pets_tags_gin on pets using gin(tags);

pet_status_history (
  id bigserial primary key,
  pet_id uuid references pets(id) on delete cascade,
  status text not null,
  reason text,
  changed_at timestamptz default now()
);

-- Users
users (
  id uuid primary key,
  email text unique,
  created_at timestamptz default now(),
  account_status text default 'registered',
  push_subscription jsonb,
  ios_pwa_installed boolean default false,
  is_admin boolean default false,
  deleted_at timestamptz                              -- set on deletion request; full purge job runs on this
);

profiles (
  user_id uuid primary key references users(id) on delete cascade,
  housing_type text,
  hdb_block_type text,
  mesh_status text,
  has_kids boolean,
  kid_ages int[] default '{}',
  other_pets text,
  work_pattern text,
  hours_alone int,
  experience text,
  activity_level text,
  budget_tier text,
  special_needs_ok boolean,
  species_pref text[],
  completion_pct int default 0 check (completion_pct between 0 and 100),
  updated_at timestamptz default now(),
  check (has_kids = true or kid_ages = '{}')
);

-- Engagement
saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  filters_json jsonb not null,
  tier_threshold text default 'good'
    check (tier_threshold in ('great', 'good', 'stretch')),
  notify boolean default true,                        -- master on/off; threshold filters which alerts fire
  last_match_at timestamptz,
  created_at timestamptz default now()
);

followed_shelters (
  user_id uuid references users(id) on delete cascade,
  shelter_id text references shelters(id),
  created_at timestamptz default now(),
  primary key (user_id, shelter_id)
);

favorites (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  created_at timestamptz default now(),
  status_when_favorited text,
  note_text text check (length(note_text) <= 500),
  primary key (user_id, pet_id)
);

passes (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, pet_id)
);

-- Matching
match_scores (
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  score int not null check (score between 0 and 100),
  tier text not null check (tier in ('great', 'good', 'stretch', 'hard_fail')),
  reasons_json jsonb not null,
  weights_version int not null,
  stale boolean default false,
  computed_at timestamptz default now(),
  primary key (user_id, pet_id)
);
create index match_scores_user_tier_idx on match_scores(user_id, tier, score desc) where stale = false;

recompute_queue (
  id bigserial primary key,
  kind text not null check (kind in ('user', 'pet', 'all')),
  target_id uuid,                                     -- user_id or pet_id depending on kind
  enqueued_at timestamptz default now(),
  picked_up_at timestamptz
);
create index recompute_queue_pending_idx on recompute_queue(enqueued_at) where picked_up_at is null;

daily_picks (
  user_id uuid references users(id) on delete cascade,
  date date not null,
  pet_ids uuid[] not null,
  generated_at timestamptz default now(),
  primary key (user_id, date)
);

-- Notifications
notifications (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  type text not null,
  pet_id uuid references pets(id) on delete set null,
  channel text not null,
  payload jsonb,
  sent_at timestamptz default now(),
  delivered_at timestamptz,                           -- distinct from sent_at: confirmed delivery
  opened_at timestamptz,                              -- email opens or push interaction
  clicked_at timestamptz                              -- click on a link in the notification
);
create index notifications_user_idx on notifications(user_id, sent_at desc);

-- Stories
adoption_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  pet_id uuid references pets(id) on delete set null,
  source_type text not null
    check (source_type in ('user_submitted', 'shelter_sourced', 'curated')),
  shelter_id text references shelters(id),
  new_name text,
  photo_url text,
  text text,
  status text not null
    check (status in ('pending', 'approved', 'rejected', 'flagged')),
  flag_count int default 0,
  created_at timestamptz default now(),
  approved_at timestamptz
);
-- Note: status default depends on source_type; enforce in application code or trigger:
-- user_submitted → 'pending'; shelter_sourced and curated → 'approved'.

-- Handoff
handoff_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  pet_id uuid references pets(id) on delete cascade,
  tapped_through_at timestamptz default now(),
  checkin_response text
    check (checkin_response in ('got_response', 'no_response', 'changed_mind') or checkin_response is null),
  checkin_at timestamptz
);

-- Activity (cached; refreshed daily)
pet_activity (
  pet_id uuid primary key references pets(id) on delete cascade,
  favorites_last_7d int default 0,
  passes_last_7d int default 0,
  views_last_7d int default 0,
  computed_at timestamptz default now()
);

-- Operational
weekly_digests (
  user_id uuid references users(id) on delete cascade,
  week_starting date,
  sent_at timestamptz,
  opened boolean default false,
  clicked boolean default false,
  primary key (user_id, week_starting)
);

extraction_cache (
  description_hash text primary key,                  -- sha256(description) — same hash hits across pets/sources, intentional
  schema_version int not null,
  result jsonb not null,
  confidence jsonb,
  created_at timestamptz default now()
);

scraper_runs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('running', 'success', 'failed')),
  pets_found int,
  pets_added int,
  pets_updated int,
  pets_marked_gone int,
  error_message text
);

cost_log (
  date date primary key,
  llm_calls int default 0,
  llm_cost_usd numeric(10,4) default 0,
  vercel_bandwidth_gb numeric(10,2),
  supabase_db_size_mb numeric(10,2),
  inngest_events int default 0
);
