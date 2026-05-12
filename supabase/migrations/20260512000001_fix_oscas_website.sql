-- Migration 006: correct OSCAS's website URL
--
-- Migration 001 seeded OSCAS at `https://oscas.org.sg`, but the canonical
-- domain is `https://www.oscas.sg` (the .org.sg apex does not resolve).
-- Discovered during Phase 2.1 when adding the OSCAS scraper. UPDATE-only,
-- additive — no schema change.

update shelters
set website = 'https://www.oscas.sg'
where id = 'oscas'
  and website = 'https://oscas.org.sg';
