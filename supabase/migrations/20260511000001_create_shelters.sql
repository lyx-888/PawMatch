-- Migration 001: shelters reference table
--
-- The 9 SG shelters per docs/requirements/02-features.md §2.1.1. IDs are stable
-- slugs used as the foreign-key target in pets.source. Websites are best-known
-- as of 2026-05; admin should verify before launch and adjust via a follow-up
-- migration if any have moved.

create extension if not exists pgcrypto with schema extensions;

create table shelters (
  id text primary key,
  name text not null,
  website text not null,
  contact_email text,
  verified_since date,
  blurb text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into shelters (id, name, website, active) values
  ('spca',                'SPCA Singapore',                'https://spca.org.sg',                  true),
  ('sosd',                'Save Our Street Dogs (SOSD)',   'https://sosd.org.sg',                  true),
  ('oscas',               'OSCAS',                          'https://oscas.org.sg',                 true),
  ('mercylight',          'Mercylight Rescue',              'https://mercylightrescue.org',         true),
  ('voices_for_animals',  'Voices for Animals',             'https://voicesforanimals.org.sg',      true),
  ('asd',                 'Action for Singapore Dogs',      'https://asd.org.sg',                   true),
  ('exclusively_mongrels','Exclusively Mongrels',           'https://exclusivelymongrels.org',      true),
  ('causes_for_animals',  'Causes for Animals Singapore',   'https://causesforanimalssingapore.org',true),
  ('cat_welfare_society', 'Cat Welfare Society',            'https://catwelfare.org',               true);
