"""Supabase client + the three write operations every scraper run needs.

`upsert_pet` is the per-record write. `mark_gone` and `record_run` are
end-of-run bookkeeping. Keep this module narrow: no scraping, no parsing — only
talking to Postgres.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

from supabase import Client, create_client

from base import PetRecord

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
