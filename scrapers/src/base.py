"""Shared scraper primitives.

Every shelter scraper imports from here. Anything that needs to be consistent
across scrapers — HTTP user agent, retry policy, the pet schema, per-source
rate limiting — lives in this module.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Iterable
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

USER_AGENT = "PawMatchSG/0.1 (+contact@pawmatch.sg)"
HTTP_TIMEOUT_SECONDS = 30.0
HTTP_MAX_RETRIES = 3
PER_SOURCE_MIN_INTERVAL_SECONDS = 1.0

Species = Literal["dog", "cat", "rabbit", "other"]
Sex = Literal["male", "female", "unknown"]
Size = Literal["small", "medium", "large"]
Status = Literal["available", "pending", "adopted", "gone"]


class PetRecord(BaseModel):
    """Canonical pet schema returned by every scraper.

    Maps 1:1 to columns in the `pets` table. Optional fields default to None;
    the LLM extraction pass (Phase 2) fills the structured ones — until then,
    scrapers populate what the shelter publishes directly.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    source_url: HttpUrl
    name: str = Field(min_length=1)
    species: Species
    breed: str | None = None
    sex: Sex | None = None
    age_months: int | None = Field(default=None, ge=0, lt=600)
    size: Size | None = None
    weight_kg: float | None = Field(default=None, ge=0)
    height_cm: float | None = Field(default=None, ge=0)
    hdb_approved: bool | None = None
    description: str | None = None
    photo_urls: list[HttpUrl] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    status: Status = "available"

    @field_validator("photo_urls")
    @classmethod
    def _at_least_unique_photos(cls, urls: list[HttpUrl]) -> list[HttpUrl]:
        seen: set[str] = set()
        unique: list[HttpUrl] = []
        for url in urls:
            key = str(url)
            if key in seen:
                continue
            seen.add(key)
            unique.append(url)
        return unique


class _PerHostRateLimiter:
    """Enforces a minimum interval between requests to each host.

    Shelters get the same per-host throttle whether they share a base URL or
    not. The host string is taken from the request URL; we don't try to
    normalize CDN-vs-app hosts because no scraper hits more than one origin
    per source anyway.
    """

    def __init__(self, min_interval_seconds: float) -> None:
        self._min_interval = min_interval_seconds
        self._lock = threading.Lock()
        self._last_request_at: dict[str, float] = {}

    def wait(self, host: str) -> None:
        with self._lock:
            now = time.monotonic()
            last = self._last_request_at.get(host)
            if last is not None:
                wait_for = self._min_interval - (now - last)
                if wait_for > 0:
                    time.sleep(wait_for)
                    now = time.monotonic()
            self._last_request_at[host] = now


_rate_limiter = _PerHostRateLimiter(PER_SOURCE_MIN_INTERVAL_SECONDS)


class _RateLimitedTransport(httpx.HTTPTransport):
    """Sleeps to enforce the per-host floor before delegating to the real transport."""

    def __init__(self, limiter: _PerHostRateLimiter, **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self._limiter = limiter

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host:
            self._limiter.wait(host)
        return super().handle_request(request)


_RETRY_STATUS_CODES = frozenset({429, 502, 503, 504})


def get_http_client(
    *,
    max_retries: int = HTTP_MAX_RETRIES,
    timeout_seconds: float = HTTP_TIMEOUT_SECONDS,
) -> httpx.Client:
    """Build the canonical scraper HTTP client.

    Behaviour: PawMatch user agent, 30s timeout, retry on connection errors
    and 429/5xx with exponential backoff, and a 1 req/sec floor per host.
    Callers should `with` it so connections close cleanly.
    """

    transport = _RateLimitedTransport(_rate_limiter, retries=max_retries)
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-SG,en;q=0.9"}
    return _RetryingClient(
        timeout=timeout_seconds,
        headers=headers,
        transport=transport,
        follow_redirects=True,
        max_retries=max_retries,
    )


class _RetryingClient(httpx.Client):
    """httpx.Client that retries on a fixed set of upstream-failure status codes.

    httpx's built-in `transport=HTTPTransport(retries=n)` only retries connection
    errors; it doesn't retry on response status. We layer a small backoff loop on
    top so a transient 502 doesn't fail the whole scrape.
    """

    def __init__(self, *, max_retries: int, **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self._max_retries = max_retries

    def send(
        self,
        request: httpx.Request,
        *args: object,
        **kwargs: object,
    ) -> httpx.Response:
        delay = 0.5
        last_response: httpx.Response | None = None
        for attempt in range(self._max_retries + 1):
            response = super().send(request, *args, **kwargs)  # type: ignore[arg-type]
            if response.status_code not in _RETRY_STATUS_CODES:
                return response
            last_response = response
            if attempt == self._max_retries:
                break
            response.close()
            time.sleep(delay)
            delay *= 2
        assert last_response is not None
        return last_response


def chunked(items: Iterable[PetRecord], size: int) -> Iterable[list[PetRecord]]:
    """Yield records in fixed-size lists. Used for batched upserts."""

    batch: list[PetRecord] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch
