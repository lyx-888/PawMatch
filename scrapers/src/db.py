"""Supabase client + the write operations every scraper run needs.

`upsert_pet` is the per-record write. `mark_gone` and `record_run` are
end-of-run bookkeeping. `apply_extraction` writes LLM-extracted fields onto a
pet row without overwriting anything the scraper found directly. Keep this
module narrow: no scraping, no parsing — only talking to Postgres.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

from supabase import Client, create_client

from base import PetRecord
from extraction import ExtractionResult

GRACE_PERIOD_DAYS = 3


def get_db_client() -> Client:
    """Return a Supabase client using the service-role key.

    Service role bypasses RLS — used here because scrapers own the `pets`,
    `pet_status_history`, and `scraper_runs` tables. Never expose this client
    to anything user-facing.
    """

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(see scrapers/.env.example)."
        )
    return create_client(url, key)


def _serialize(record: PetRecord) -> dict[str, Any]:
    """Map a PetRecord to its DB row.

    Pydantic's `HttpUrl` serializes to its string form via `model_dump(mode='json')`.
    Anything Pydantic returns as None is left out so DB defaults take effect.
    """

    raw = record.model_dump(mode="json", exclude_none=False)
    raw["last_seen_at"] = datetime.now(UTC).isoformat()
    raw["scraped_at"] = raw["last_seen_at"]
    return raw


def upsert_pet(client: Client, record: PetRecord) -> dict[str, Any]:
    """Insert or update a single pet row.

    Uniqueness key is `(source, source_id)`. On update, `first_seen_at` is
    preserved (it has a default that only fires on insert), and
    `last_seen_at`/`scraped_at` are bumped to now. Status defaults to whatever
    the scraper set — typically 'available' — and the trigger logs any change.
    """

    payload = _serialize(record)
    payload.pop("first_seen_at", None)  # let the DB default apply on insert only
    result = (
        client.table("pets")
        .upsert(payload, on_conflict="source,source_id")
        .execute()
    )
    rows = result.data or []
    if rows and isinstance(rows[0], dict):
        return dict(rows[0])
    return {}


def upsert_pets(client: Client, records: list[PetRecord]) -> int:
    """Bulk variant. Returns the number of rows written.

    Supabase's PostgREST upsert accepts a JSON array, so we send everything in
    one round-trip per call. Caller is responsible for batching to keep request
    size manageable; ~200 rows per call is a safe ceiling.
    """

    if not records:
        return 0
    payload = [_serialize(r) for r in records]
    for row in payload:
        row.pop("first_seen_at", None)
    result = (
        client.table("pets")
        .upsert(payload, on_conflict="source,source_id")
        .execute()
    )
    return len(result.data or [])


def mark_gone(
    client: Client,
    source: str,
    seen_source_ids: list[str],
    *,
    grace_period_days: int = GRACE_PERIOD_DAYS,
) -> int:
    """Mark pets that vanished from the latest scrape as `gone`.

    A pet is considered gone if (a) the latest scrape did not return it and (b)
    its `last_seen_at` is older than the grace period. The grace window absorbs
    transient outages where a shelter page returns 0 pets briefly. Only pets
    currently in 'available' or 'pending' transition; 'adopted'/'gone' are left
    alone so we don't overwrite an explicit status.
    """

    cutoff = (datetime.now(UTC) - timedelta(days=grace_period_days)).isoformat()
    query = (
        client.table("pets")
        .update({"status": "gone", "status_reason": "not seen on source"})
        .eq("source", source)
        .in_("status", ["available", "pending"])
        .lt("last_seen_at", cutoff)
    )
    if seen_source_ids:
        # PostgREST `not.in.()` requires a comma-separated list of quoted values.
        quoted = ",".join(f'"{sid}"' for sid in seen_source_ids)
        query = query.filter("source_id", "not.in", f"({quoted})")
    result = query.execute()
    return len(result.data or [])


def record_run(
    client: Client,
    source: str,
    *,
    status: str,
    pets_found: int = 0,
    pets_added: int = 0,
    pets_updated: int = 0,
    pets_marked_gone: int = 0,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    error_message: str | None = None,
) -> int:
    """Append one row to `scraper_runs` and return its id."""

    payload: dict[str, Any] = {
        "source": source,
        "status": status,
        "pets_found": pets_found,
        "pets_added": pets_added,
        "pets_updated": pets_updated,
        "pets_marked_gone": pets_marked_gone,
        "error_message": error_message,
    }
    if started_at is not None:
        payload["started_at"] = started_at.isoformat()
    if finished_at is not None:
        payload["finished_at"] = finished_at.isoformat()

    result = client.table("scraper_runs").insert(payload).execute()
    rows = result.data or []
    if not rows:
        return 0
    row_id: Any = rows[0]["id"] if isinstance(rows[0], dict) else 0
    return int(row_id)


# --- Extraction write-back ------------------------------------------------

# Only these LLM fields are eligible to land on a pets row. Tags are merged
# instead of replaced (see `apply_extraction`) so the scraper's free-text
# tags survive alongside the controlled-vocab ones.
_EXTRACTABLE_COLUMNS = ("hdb_approved", "size", "age_months", "energy_level")


def apply_extraction(
    client: Client,
    source: str,
    source_id: str,
    *,
    result: ExtractionResult,
) -> bool:
    """Merge an LLM extraction onto an existing pets row.

    Conservative-bias rules:

    * Scraper-provided values win — we only fill columns where the current
      value is `null`. Shelter-structured data (e.g. SOSD's HDB field) is
      ground truth, not the LLM's guess.
    * Tags are merged, not replaced. The LLM's controlled-vocab tags are
      appended to whatever the scraper already wrote, deduped while
      preserving the scraper's original order.
    * `low_confidence_fields` is recorded only for columns we actually
      ended up writing from the LLM. If the scraper already filled
      `hdb_approved`, its confidence is irrelevant — we didn't use it.

    Returns `True` if at least one column was updated.
    """

    response = (
        client.table("pets")
        .select("id, hdb_approved, size, age_months, energy_level, tags, low_confidence_fields")
        .eq("source", source)
        .eq("source_id", source_id)
        .maybe_single()
        .execute()
    )
    row: dict[str, Any] | None = getattr(response, "data", None)
    if row is None:
        return False

    attrs = result.attributes
    update: dict[str, Any] = {}
    written_columns: list[str] = []

    extracted_values: dict[str, Any] = {
        "hdb_approved": attrs.hdb_approved,
        "size": attrs.size,
        "age_months": attrs.age_months,
        "energy_level": attrs.energy_level,
    }
    for column in _EXTRACTABLE_COLUMNS:
        if row.get(column) is not None:
            continue  # scraper already supplied this — leave it alone
        value = extracted_values[column]
        if value is None:
            continue  # LLM couldn't fill it either
        update[column] = value
        written_columns.append(column)

    merged_tags = _merge_tags(row.get("tags") or [], attrs.tags)
    if merged_tags != (row.get("tags") or []):
        update["tags"] = merged_tags
        if attrs.tags:
            written_columns.append("tags")

    if not update:
        return False

    # Replace the existing low_confidence_fields array entirely with the
    # columns we just wrote from the LLM. Anything the scraper provided
    # stays out of the array — it's not low-confidence by construction.
    update["low_confidence_fields"] = sorted(
        set(written_columns) & set(result.low_confidence_fields)
    )

    client.table("pets").update(update).eq("id", row["id"]).execute()
    return True


def _merge_tags(existing: list[str], new: list[str]) -> list[str]:
    """Append `new` to `existing`, deduped, preserving first-seen order.

    Scraper-provided tags (free-text, e.g. "Senior, Shy & Skittish") come
    first; LLM controlled-vocab tags (e.g. "senior", "shy") come after.
    The two vocabularies don't collide in practice because the LLM tags
    are snake_case and the scraper tags are usually title-cased English.
    """

    seen: set[str] = set()
    out: list[str] = []
    for tag in [*existing, *new]:
        if tag in seen:
            continue
        seen.add(tag)
        out.append(tag)
    return out
