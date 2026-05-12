"""Top-level scraper orchestrator. Invoked daily by cron.

Each registered source must expose a `scrape() -> list[PetRecord]` function.
The runner calls them one at a time, isolating failures: one shelter blowing
up never blocks another. Per-run bookkeeping goes to `scraper_runs` so the
health endpoint can read off latest status.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from base import PetRecord
from db import get_db_client, mark_gone, record_run, upsert_pets

logger = logging.getLogger(__name__)

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
        "scraper %s ok: found=%d written=%d marked_gone=%d",
        config.name, len(records), written, marked_gone,
    )
    return RunSummary(
        source=config.name, status="success", pets_found=len(records),
        pets_marked_gone=marked_gone, error=None,
    )


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
