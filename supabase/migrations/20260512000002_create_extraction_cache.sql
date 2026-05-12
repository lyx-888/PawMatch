-- Migration 007: extraction_cache
--
-- Caches LLM extraction results so the same description never costs us
-- two calls. Key is sha256(description + schema_version) — the schema_version
-- column lets us purge or ignore old rows when the prompt or output shape
-- changes (we never delete; we just bump the version and write fresh rows).
--
-- payload is the verbatim JSON the wrapper hands back to callers. Storing
-- it raw means the same row can satisfy callers who only need a subset of
-- fields without re-parsing or re-computing.
--
-- The token + cost columns let us answer "what did the second-run cache
-- hit save us?" without joining cost_log.

create table extraction_cache (
  cache_key       text primary key,
  schema_version  text not null,
  payload         jsonb not null,
  llm_model       text not null,
  input_tokens    int  not null check (input_tokens >= 0),
  output_tokens   int  not null check (output_tokens >= 0),
  cost_usd        numeric(10,6) not null check (cost_usd >= 0),
  created_at      timestamptz not null default now()
);

create index extraction_cache_schema_version_idx
  on extraction_cache(schema_version);
create index extraction_cache_created_at_idx
  on extraction_cache(created_at desc);

grant select, insert, update, delete on extraction_cache to service_role;
