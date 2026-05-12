"""Top-level scraper orchestrator. Invoked daily by cron.

Each registered source must expose a `scrape() -> list[PetRecord]` function.
The runner calls them one at a time, isolating failures: one shelter blowing
up never blocks another. After every successful scrape the LLM extractor
(Phase 2.2) enriches each pet's row with structured attributes derived from
the description. Per-run bookkeeping goes to `scraper_runs` so the health
endpoint can read off latest status.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from supabase import Client

from base import PetRecord
from db import apply_extraction, get_db_client, mark_gone, record_run, upsert_pets
from extraction import extract_attributes

logger = logging.getLogger(__name__)

# Setting this env var to a truthy value bypasses the LLM enrichment pass —
# useful for local runs that don't have an OpenAI key, and as the kill
# switch documented in docs/tasks/README.md ("Disable LLM extraction").
LLM_DISABLED_ENV = "LLM_DISABLED"

# Implicit-disable env var. When OPENAI_API_KEY is absent the wrapper would
# raise on its first call; we'd rather log once and skip than spam per-pet
# tracebacks. Distinct from LLM_DISABLED so explicit-disable still logs a
# different reason in admin (Phase 5).
OPENAI_KEY_ENV = "OPENAI_API_KEY"

ScrapeFn = Callable[[], list[PetRecord]]


@dataclass(frozen=True)
class SourceConfig:
    name: str
    scrape: ScrapeFn


@dataclass(frozen=True)
class RunSummary:
    source: str
    status: str
    pets_found: int
    pets_marked_gone: int
    error: str | None


def _registered_sources() -> list[SourceConfig]:
    """Build the source registry lazily.

    Done at call time (not import time) so an import error in one scraper
    doesn't crash the runner's import path. Phase 1 only has SPCA; later
    phases append here.
    """

    import importlib

    sources: list[SourceConfig] = []
    for name in ("spca", "sosd", "oscas"):
        try:
            module = importlib.import_module(f"sources.{name}")
        except ImportError:
            logger.warning("sources.%s not yet implemented; skipping", name)
            continue
        sources.append(SourceConfig(name=name, scrape=module.scrape))
    return sources


def run_source(config: SourceConfig) -> RunSummary:
    """Run a single source end-to-end and return a summary.

    Records a `scraper_runs` row in both the success and failure branches so
    the dashboard never has a silent gap.
    """

    started_at = datetime.now(UTC)
    client = get_db_client()
    try:
        records = config.scrape()
    except Exception as exc:  # noqa: BLE001 — top-level isolation boundary
        logger.exception("scraper %s failed", config.name)
        record_run(
            client,
            config.name,
            status="failed",
            started_at=started_at,
            finished_at=datetime.now(UTC),
            error_message=str(exc),
        )
        return RunSummary(
            source=config.name, status="failed", pets_found=0,
            pets_marked_gone=0, error=str(exc),
        )

    written = upsert_pets(client, records)
    seen_ids = [r.source_id for r in records]
    marked_gone = mark_gone(client, config.name, seen_ids)

    enriched = _enrich_with_llm(client, records)

    record_run(
        client,
        config.name,
        status="success",
        pets_found=len(records),
        pets_updated=written,
        pets_marked_gone=marked_gone,
        started_at=started_at,
        finished_at=datetime.now(UTC),
    )
    logger.info(
        "scraper %s ok: found=%d written=%d marked_gone=%d enriched=%d",
        config.name, len(records), written, marked_gone, enriched,
    )
    return RunSummary(
        source=config.name, status="success", pets_found=len(records),
        pets_marked_gone=marked_gone, error=None,
    )


def _enrich_with_llm(client: Client, records: list[PetRecord]) -> int:
    """Run the LLM extractor over each record and write back the result.

    Skipping conditions, each logged so admin (Phase 5) can spot patterns:

    * Pet has no description → nothing to read.
    * Daily $2 cap reached → `extract_attributes` returns None and we stop
      enriching the rest of this run (subsequent calls would also short-
      circuit at the cap check). Existing rows continue serving their
      previous extraction.
    * One pet's call raises → log + skip just that pet, keep going.

    The `LLM_DISABLED=1` env var bypasses the whole pass — the kill switch
    listed in docs/tasks/README.md.
    """

    if _truthy_env(LLM_DISABLED_ENV):
        logger.info("LLM extraction disabled via %s; skipping enrichment", LLM_DISABLED_ENV)
        return 0
    if not os.environ.get(OPENAI_KEY_ENV):
        # Treat a missing key like the explicit kill switch — log once and
        # skip the loop. The previous behaviour raised on every pet, which
        # produced hundreds of identical tracebacks and made real failures
        # hard to spot.
        logger.warning(
            "%s not set; skipping LLM enrichment (pets serve with scraper-only data)",
            OPENAI_KEY_ENV,
        )
        return 0

    enriched = 0
    for record in records:
        if not record.description:
            continue
        try:
            result = extract_attributes(record.description, db_client=client)
        except Exception:  # noqa: BLE001 — per-pet isolation
            logger.exception(
                "extraction failed for %s/%s; pet still serves with scraper data",
                record.source, record.source_id,
            )
            continue
        if result is None:
            # Either cap reached or empty description. Once the cap is hit
            # every subsequent call will short-circuit too, so it's fine
            # to keep looping — the cost check inside the wrapper is cheap.
            continue
        try:
            if apply_extraction(
                client,
                record.source,
                record.source_id,
                result=result,
            ):
                enriched += 1
        except Exception:  # noqa: BLE001 — per-pet isolation
            logger.exception(
                "apply_extraction failed for %s/%s",
                record.source, record.source_id,
            )
    return enriched


def _truthy_env(name: str) -> bool:
    """`'1' / 'true' / 'yes'` (case-insensitive) → True; anything else → False."""

    value = os.environ.get(name, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def main() -> int:
    """CLI entry point. Returns 0 if every source ran (even if some failed)."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    sources = _registered_sources()
    if not sources:
        logger.warning("no scrapers registered; nothing to do")
        return 0
    for config in sources:
        run_source(config)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
