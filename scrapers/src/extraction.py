"""LLM extraction of structured pet attributes from free-text descriptions.

Shelters publish what fits their template — sometimes structured (SOSD has
HDB / Categories / Age fields), often free-text in the description paragraph.
This module reads that paragraph and pulls out matching-engine fields the
scraper couldn't lift directly: hdb_approved, size, age_months, energy_level,
and a fixed-vocabulary tag list per docs/requirements §2.1.4.

All LLM calls go through `extract_attributes` — the single wrapper required
by CLAUDE.md. Each call:

  1. Hashes the description with the schema version.
  2. Looks up the cache; identical text never costs a second call.
  3. Checks today's spend against the $2 USD cap; over-cap returns `None`.
  4. Asks gpt-4o-mini via OpenAI's structured-outputs API for the typed
     `ExtractedAttributes` model.
  5. Accrues the call's token usage and cost in `cost_log` for today.
  6. Writes the cache row.

Conservative defaults from §2.1.4 ("hdb_approved=true only if it clearly
fits HDB rules; never `true` for unknown size") are encoded in the system
prompt. Caller-facing safety — never showing a low-confidence
`hdb_approved=true` as `true` in filtering or matching — is the matching
engine's job; here we report the LLM's raw values plus the parallel
confidences so downstream code can decide.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


# --- Constants -------------------------------------------------------------

# Bump this when the prompt, schema, or vocabulary changes. The hash key
# embeds it, so old cache rows for the previous version are simply ignored
# rather than purged.
EXTRACTION_SCHEMA_VERSION = "1"

LLM_MODEL = "gpt-4o-mini"

# gpt-4o-mini pricing (USD per token). Update if OpenAI changes pricing.
INPUT_USD_PER_TOKEN = Decimal("0.15") / Decimal(1_000_000)
OUTPUT_USD_PER_TOKEN = Decimal("0.60") / Decimal(1_000_000)

# Hard ceiling per docs/requirements §2.1.4. When today's spend reaches this,
# new extractions are skipped until the next day. Existing rows keep serving.
DAILY_CAP_USD = Decimal("2.00")

# Fixed tag vocabulary from §2.1.4. Anything the LLM returns outside this
# list is dropped — keeping the matching engine's input space stable.
TAG_VOCABULARY: tuple[str, ...] = (
    "good_with_kids",
    "good_with_cats",
    "good_with_dogs",
    "special_needs",
    "house_trained",
    "senior",
    "shy",
    "active",
    "needs_foster",
)

# Anything below this confidence is recorded in pets.low_confidence_fields.
CONFIDENCE_THRESHOLD = 0.7


SIZE_VALUES = Literal["small", "medium", "large"]
ENERGY_VALUES = Literal["low", "medium", "high"]


# --- Schemas --------------------------------------------------------------


class ExtractedAttributes(BaseModel):
    """The structured fields the LLM returns for one description.

    Field names match `pets` columns where they correspond. Each value has
    a parallel `*_confidence` float so the matching engine can apply the
    §2.1.4 conservative-bias rules (e.g., low-confidence `hdb_approved`
    treated as `null`).

    Tags are a single multi-select with one shared confidence — the LLM
    decides the set as a whole, and per-tag confidence would be both
    noisier and harder to use.
    """

    # `extra=forbid` rejects any unexpected keys the API might return,
    # giving us a clear error rather than silent drift.
    model_config = ConfigDict(extra="forbid")

    hdb_approved: bool | None = Field(
        description=(
            "True only if the description clearly indicates the pet fits "
            "Singapore HDB rules (HDB-approved size and breed). False if "
            "clearly oversized or banned. null when unclear."
        )
    )
    hdb_approved_confidence: float = Field(ge=0.0, le=1.0)

    size: SIZE_VALUES | None = Field(
        description="Adult size: small (<10kg), medium (10-25kg), large (>25kg)."
    )
    size_confidence: float = Field(ge=0.0, le=1.0)

    age_months: int | None = Field(
        ge=0,
        le=600,
        description=(
            "Best estimate in months. 'puppy' or 'kitten' → 4, "
            "'1 year' → 12, '2 years' → 24, 'senior' → null unless a number "
            "is given."
        ),
    )
    age_months_confidence: float = Field(ge=0.0, le=1.0)

    energy_level: ENERGY_VALUES | None = Field(
        description=(
            "Inferred from descriptors. 'couch potato', 'low key' → low; "
            "'playful', 'curious' → medium; 'high energy', 'needs lots of "
            "exercise' → high. null if no cues."
        )
    )
    energy_level_confidence: float = Field(ge=0.0, le=1.0)

    tags: list[str] = Field(
        default_factory=list,
        description=(
            "Multi-select from the fixed vocabulary: "
            "good_with_kids, good_with_cats, good_with_dogs, special_needs, "
            "house_trained, senior, shy, active, needs_foster. Only include a "
            "tag when clearly supported by the description."
        ),
    )
    tags_confidence: float = Field(ge=0.0, le=1.0, default=1.0)


@dataclass(frozen=True)
class ExtractionResult:
    """Wrapper around `ExtractedAttributes` with the bookkeeping a caller
    needs to update a `pets` row.

    `low_confidence_fields` is pre-computed from the confidences against
    `CONFIDENCE_THRESHOLD` so the caller (runner) doesn't need to repeat
    the comparison. `cached` flags whether this came from the DB cache —
    useful in logs and in tests.
    """

    attributes: ExtractedAttributes
    low_confidence_fields: list[str]
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    cached: bool


# --- Public API -----------------------------------------------------------


class _OpenAIClient(Protocol):
    """The slice of the OpenAI SDK the extractor uses.

    Defined as a Protocol so tests can pass a stub without depending on the
    real `openai` package. The wrapper only calls the parsing helper.
    """

    @property
    def beta(self) -> Any: ...


class _DBClient(Protocol):
    """The slice of the Supabase client used here.

    Same reason as the OpenAI protocol: tests pass a fake that implements
    `.table(name).select/insert/update/upsert(...).execute()`.
    """

    def table(self, name: str) -> Any: ...


def extract_attributes(
    description: str,
    *,
    db_client: _DBClient,
    openai_client: _OpenAIClient | None = None,
    today: date | None = None,
) -> ExtractionResult | None:
    """Extract structured attributes from one pet description.

    Returns:
        * `ExtractionResult` on cache hit or successful LLM call.
        * `None` when the daily spend cap would be exceeded by this call.

    Skips extraction (returns `None`) when `description` is empty or just
    whitespace — there's nothing to read.
    """

    description = (description or "").strip()
    if not description:
        return None

    cache_key = _cache_key(description, EXTRACTION_SCHEMA_VERSION)

    cached = _read_cache(db_client, cache_key)
    if cached is not None:
        return cached

    today = today or _today_utc()
    spent_today = _today_spend_usd(db_client, today)
    if spent_today >= DAILY_CAP_USD:
        logger.warning(
            "extraction skipped: daily cap reached (spent=%s, cap=%s)",
            spent_today, DAILY_CAP_USD,
        )
        return None

    client = openai_client or _default_openai_client()
    attributes, input_tokens, output_tokens = _call_llm(client, description)
    cost = _compute_cost(input_tokens, output_tokens)

    # Accrue first so a crash before cache-write still leaves the books
    # accurate. The cache write is the recoverable side of the pair: if it
    # fails, we just pay for the same description twice.
    _accrue_cost(db_client, today, cost=cost, calls=1)
    _write_cache(
        db_client,
        cache_key,
        attributes=attributes,
        model=LLM_MODEL,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost,
    )

    return ExtractionResult(
        attributes=attributes,
        low_confidence_fields=_low_confidence_fields(attributes),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost,
        cached=False,
    )


# --- Cache ----------------------------------------------------------------


def _cache_key(description: str, schema_version: str) -> str:
    """sha256 of `<schema_version>:<description>`. The version goes in the
    hash input so a prompt change yields a fresh key without us having to
    purge the table."""

    payload = f"{schema_version}:{description}".encode()
    return hashlib.sha256(payload).hexdigest()


def _read_cache(db_client: _DBClient, cache_key: str) -> ExtractionResult | None:
    """Return the cached extraction if present, else None."""

    response = (
        db_client.table("extraction_cache")
        .select("payload, input_tokens, output_tokens, cost_usd")
        .eq("cache_key", cache_key)
        .maybe_single()
        .execute()
    )
    row = getattr(response, "data", None)
    if not row:
        return None

    attributes = ExtractedAttributes.model_validate(row["payload"])
    return ExtractionResult(
        attributes=attributes,
        low_confidence_fields=_low_confidence_fields(attributes),
        input_tokens=int(row["input_tokens"]),
        output_tokens=int(row["output_tokens"]),
        cost_usd=Decimal(str(row["cost_usd"])),
        cached=True,
    )


def _write_cache(
    db_client: _DBClient,
    cache_key: str,
    *,
    attributes: ExtractedAttributes,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal,
) -> None:
    """Insert a cache row. Idempotent via on_conflict on cache_key."""

    payload = {
        "cache_key": cache_key,
        "schema_version": EXTRACTION_SCHEMA_VERSION,
        "payload": attributes.model_dump(mode="json"),
        "llm_model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        # Decimals serialize as floats over JSON by default; cast to str so
        # PostgREST preserves full precision in the numeric(10,6) column.
        "cost_usd": str(cost_usd),
    }
    db_client.table("extraction_cache").upsert(
        payload, on_conflict="cache_key"
    ).execute()


# --- Cost tracking --------------------------------------------------------


def _compute_cost(input_tokens: int, output_tokens: int) -> Decimal:
    """Per-call cost in USD, rounded to six decimal places (the precision
    of cost_log.cost_usd)."""

    raw = (Decimal(input_tokens) * INPUT_USD_PER_TOKEN) + (
        Decimal(output_tokens) * OUTPUT_USD_PER_TOKEN
    )
    return raw.quantize(Decimal("0.000001"))


def _today_spend_usd(db_client: _DBClient, today: date) -> Decimal:
    """Read today's cost_log row, returning 0 if it hasn't been opened yet."""

    response = (
        db_client.table("cost_log")
        .select("llm_cost_usd")
        .eq("date", today.isoformat())
        .maybe_single()
        .execute()
    )
    row = getattr(response, "data", None)
    if not row:
        return Decimal("0")
    return Decimal(str(row["llm_cost_usd"]))


def _accrue_cost(
    db_client: _DBClient,
    today: date,
    *,
    cost: Decimal,
    calls: int,
) -> None:
    """Add `cost` and `calls` to today's cost_log row, creating it if needed.

    Read-modify-write. Safe because the scraper runs serially (the GitHub
    Actions workflow uses `concurrency: scraper-run, cancel-in-progress: false`
    so no two scrapes accrue at once).
    """

    today_iso = today.isoformat()
    response = (
        db_client.table("cost_log")
        .select("llm_calls, llm_cost_usd")
        .eq("date", today_iso)
        .maybe_single()
        .execute()
    )
    row = getattr(response, "data", None)
    if row is None:
        db_client.table("cost_log").insert(
            {
                "date": today_iso,
                "llm_calls": calls,
                "llm_cost_usd": str(cost),
            }
        ).execute()
        return

    new_calls = int(row["llm_calls"]) + calls
    new_cost = Decimal(str(row["llm_cost_usd"])) + cost
    db_client.table("cost_log").update(
        {"llm_calls": new_calls, "llm_cost_usd": str(new_cost)}
    ).eq("date", today_iso).execute()


# --- LLM call -------------------------------------------------------------


SYSTEM_PROMPT = (
    "You are extracting structured attributes from a Singapore animal-shelter "
    "pet adoption listing. Read the description and fill out the schema. "
    "Be conservative: when the text doesn't clearly support a value, return "
    "null (not a guess) and lower the confidence.\n\n"
    "Specific rules:\n"
    "- hdb_approved: true only if the text clearly indicates HDB-suitable "
    "  size AND a non-banned breed. Never true when size is unknown. False "
    "  when clearly oversized or a banned breed.\n"
    "- size: infer from weight when stated, otherwise from breed cues. "
    "  small <10kg, medium 10-25kg, large >25kg. null if no cue.\n"
    "- age_months: 'puppy' → 4, 'kitten' → 4, '1 year' → 12, '2 yrs' → 24. "
    "  Decimal years allowed: '10.5 years' → 126. null when no age signal.\n"
    "- energy_level: low/medium/high based on temperament cues. null when "
    "  the description is purely backstory with no behaviour signal.\n"
    "- tags: include only when clearly supported. Vocabulary is fixed: "
    "  good_with_kids, good_with_cats, good_with_dogs, special_needs, "
    "  house_trained, senior, shy, active, needs_foster.\n"
    "- Confidence: 1.0 when the text states the fact outright; 0.8-0.9 when "
    "  reasonably inferred; 0.5-0.7 when a guess; <0.5 when speculative.\n"
)


def _call_llm(
    openai_client: _OpenAIClient, description: str
) -> tuple[ExtractedAttributes, int, int]:
    """Run the structured-outputs call; return (attrs, input_tokens, output_tokens).

    Uses `beta.chat.completions.parse` so the SDK validates the response
    against `ExtractedAttributes` for us. Any parse failure raises and
    aborts this pet's enrichment — the next scrape will retry.
    """

    completion = openai_client.beta.chat.completions.parse(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": description},
        ],
        response_format=ExtractedAttributes,
    )
    message = completion.choices[0].message
    parsed = message.parsed
    if parsed is None:
        # Refusal or empty parse — surface as a runtime error rather than
        # silently writing nothing. The runner already isolates per-pet
        # failures, so this only skips one record.
        refusal = getattr(message, "refusal", None)
        raise RuntimeError(f"extraction returned no parse (refusal={refusal!r})")

    # Filter out-of-vocabulary tags rather than failing the whole call —
    # the LLM occasionally invents a synonym, and we'd rather lose that
    # tag than the entire extraction.
    cleaned_tags = [t for t in parsed.tags if t in TAG_VOCABULARY]
    if cleaned_tags != parsed.tags:
        # `model_copy` keeps the rest of the fields intact.
        parsed = parsed.model_copy(update={"tags": cleaned_tags})

    usage = completion.usage
    input_tokens = int(usage.prompt_tokens) if usage else 0
    output_tokens = int(usage.completion_tokens) if usage else 0
    return parsed, input_tokens, output_tokens


def _default_openai_client() -> _OpenAIClient:
    """Construct the real OpenAI client from `OPENAI_API_KEY`.

    Imported lazily so test environments without `openai` installed can
    still import this module. Same reason: `OPENAI_API_KEY` is only
    required when an actual call is about to happen.
    """

    from openai import OpenAI

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY must be set for extraction calls.")
    return OpenAI(api_key=api_key)


# --- Confidence helpers ---------------------------------------------------


def _low_confidence_fields(attributes: ExtractedAttributes) -> list[str]:
    """Return the subset of column names whose confidence is below the
    threshold, preserving the column order so the output is stable.

    Tags is included as a single entry because the model emits one shared
    confidence for the whole tag set.
    """

    pairs: list[tuple[str, float]] = [
        ("hdb_approved", attributes.hdb_approved_confidence),
        ("size", attributes.size_confidence),
        ("age_months", attributes.age_months_confidence),
        ("energy_level", attributes.energy_level_confidence),
        ("tags", attributes.tags_confidence),
    ]
    return [name for name, conf in pairs if conf < CONFIDENCE_THRESHOLD]


# --- Misc -----------------------------------------------------------------


def _today_utc() -> date:
    """Today in UTC. Scrapers run on GitHub Actions in UTC; the cost log's
    primary key is UTC date for consistency."""

    return datetime.now(UTC).date()


__all__ = [
    "DAILY_CAP_USD",
    "EXTRACTION_SCHEMA_VERSION",
    "ExtractedAttributes",
    "ExtractionResult",
    "LLM_MODEL",
    "TAG_VOCABULARY",
    "extract_attributes",
]
