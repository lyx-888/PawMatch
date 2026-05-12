"""Tests for the LLM extraction wrapper.

No real OpenAI calls and no real database. The Supabase client is stubbed
with an in-memory table store keyed by primary key; the OpenAI client is
stubbed with a queue of canned responses. Together that lets us cover the
full code path — cache hit, cap exceeded, cost accrual, low-confidence
flagging — deterministically.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import pytest

from extraction import (
    CONFIDENCE_THRESHOLD,
    DAILY_CAP_USD,
    EXTRACTION_SCHEMA_VERSION,
    LLM_MODEL,
    TAG_VOCABULARY,
    ExtractedAttributes,
    _cache_key,
    _compute_cost,
    _low_confidence_fields,
    extract_attributes,
)

# --- Fakes ----------------------------------------------------------------


class _FakeQuery:
    """One pending SQL operation on a fake table.

    Captures the chain of `.eq()`/`.maybe_single()`/etc. that PostgREST
    callers build up, then runs the operation against the parent table's
    in-memory dict when `.execute()` is finally invoked. Only the methods
    actually used by `extraction.py` and `db.py` are implemented.
    """

    def __init__(self, table: _FakeTable, op: str, payload: Any = None) -> None:
        self._table = table
        self._op = op
        self._payload = payload
        self._filters: list[tuple[str, Any]] = []
        self._single = False
        self._on_conflict: str | None = None
        self._select_cols: list[str] | None = None

    def select(self, cols: str, *_: Any, **__: Any) -> _FakeQuery:
        self._select_cols = [c.strip() for c in cols.split(",")]
        return self

    def eq(self, col: str, value: Any) -> _FakeQuery:
        self._filters.append((col, value))
        return self

    def maybe_single(self) -> _FakeQuery:
        self._single = True
        return self

    def upsert(self, payload: Any, on_conflict: str | None = None) -> _FakeQuery:
        self._op = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def insert(self, payload: Any) -> _FakeQuery:
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: Any) -> _FakeQuery:
        self._op = "update"
        self._payload = payload
        return self

    def execute(self) -> Any:
        if self._op == "select":
            return self._execute_select()
        if self._op == "insert":
            self._table.rows.append(dict(self._payload))
            return _Response(self._payload)
        if self._op == "upsert":
            assert self._on_conflict, "upsert requires on_conflict for our fake"
            key_col = self._on_conflict
            existing = next(
                (row for row in self._table.rows if row.get(key_col) == self._payload.get(key_col)),
                None,
            )
            if existing is None:
                self._table.rows.append(dict(self._payload))
            else:
                existing.update(self._payload)
            return _Response(self._payload)
        if self._op == "update":
            for row in self._table.rows:
                if all(row.get(k) == v for k, v in self._filters):
                    row.update(self._payload)
            return _Response(None)
        raise AssertionError(f"unhandled fake op: {self._op}")

    def _execute_select(self) -> Any:
        matched = [
            row for row in self._table.rows
            if all(row.get(k) == v for k, v in self._filters)
        ]
        if self._single:
            return _Response(matched[0] if matched else None)
        return _Response(matched)


class _Response:
    """The shape Supabase-py returns: `.data` plus a few unused fields."""

    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeTable:
    """In-memory backing store for one table."""

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def select(self, *args: Any, **kwargs: Any) -> _FakeQuery:
        return _FakeQuery(self, "select").select(*args, **kwargs)

    def insert(self, payload: Any) -> _FakeQuery:
        return _FakeQuery(self, "insert", payload)

    def upsert(self, payload: Any, on_conflict: str | None = None) -> _FakeQuery:
        return _FakeQuery(self, "upsert", payload).upsert(payload, on_conflict)

    def update(self, payload: Any) -> _FakeQuery:
        return _FakeQuery(self, "update", payload)


class _FakeDB:
    """Multi-table fake; auto-creates a table on first `.table(name)`."""

    def __init__(self) -> None:
        self._tables: dict[str, _FakeTable] = {}

    def table(self, name: str) -> _FakeTable:
        return self._tables.setdefault(name, _FakeTable())

    # Test helpers.
    def rows(self, name: str) -> list[dict[str, Any]]:
        return self._tables.setdefault(name, _FakeTable()).rows


class _FakeUsage:
    def __init__(self, prompt_tokens: int, completion_tokens: int) -> None:
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class _FakeMessage:
    def __init__(self, parsed: ExtractedAttributes | None) -> None:
        self.parsed = parsed
        self.refusal = None


class _FakeChoice:
    def __init__(self, message: _FakeMessage) -> None:
        self.message = message


class _FakeCompletion:
    def __init__(self, parsed: ExtractedAttributes | None, *, usage: _FakeUsage) -> None:
        self.choices = [_FakeChoice(_FakeMessage(parsed))]
        self.usage = usage


class _FakeBetaParse:
    def __init__(self, responses: list[_FakeCompletion]) -> None:
        self._responses = responses
        self.calls: list[dict[str, Any]] = []

    def parse(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        response_format: type,
    ) -> _FakeCompletion:
        self.calls.append(
            {"model": model, "messages": messages, "response_format": response_format}
        )
        if not self._responses:
            raise AssertionError("FakeOpenAI ran out of canned responses")
        return self._responses.pop(0)


class _FakeBeta:
    def __init__(self, completions: _FakeBetaParse) -> None:
        self.chat = _FakeBetaChat(completions)


class _FakeBetaChat:
    def __init__(self, completions: _FakeBetaParse) -> None:
        self.completions = completions


class _FakeOpenAI:
    """Stand-in for `openai.OpenAI()` with just the slice we exercise."""

    def __init__(self, *responses: _FakeCompletion) -> None:
        self._parse = _FakeBetaParse(list(responses))
        self.beta = _FakeBeta(self._parse)

    @property
    def call_count(self) -> int:
        return len(self._parse.calls)

    @property
    def last_user_content(self) -> str:
        return self._parse.calls[-1]["messages"][-1]["content"]


# --- Builders -------------------------------------------------------------


def _attrs(
    *,
    hdb_approved: bool | None = True,
    hdb_conf: float = 0.9,
    size: str | None = "medium",
    size_conf: float = 0.9,
    age_months: int | None = 24,
    age_conf: float = 0.9,
    energy: str | None = "medium",
    energy_conf: float = 0.9,
    tags: list[str] | None = None,
    tags_conf: float = 0.9,
) -> ExtractedAttributes:
    return ExtractedAttributes(
        hdb_approved=hdb_approved,
        hdb_approved_confidence=hdb_conf,
        size=size,  # type: ignore[arg-type]
        size_confidence=size_conf,
        age_months=age_months,
        age_months_confidence=age_conf,
        energy_level=energy,  # type: ignore[arg-type]
        energy_level_confidence=energy_conf,
        tags=tags if tags is not None else ["senior"],
        tags_confidence=tags_conf,
    )


def _completion(
    attrs: ExtractedAttributes, *, prompt: int = 250, output: int = 120
) -> _FakeCompletion:
    return _FakeCompletion(attrs, usage=_FakeUsage(prompt, output))


FROZEN_TODAY = date(2026, 5, 12)


# --- Cache key + cost helpers --------------------------------------------


class TestCacheKey:
    def test_deterministic(self) -> None:
        a = _cache_key("Hello there", "1")
        b = _cache_key("Hello there", "1")
        assert a == b

    def test_changes_with_description(self) -> None:
        a = _cache_key("Hello there", "1")
        b = _cache_key("Hello there!", "1")
        assert a != b

    def test_changes_with_schema_version(self) -> None:
        # The version is part of the hash input so old cache rows from a
        # previous prompt automatically miss when the version bumps.
        a = _cache_key("Hello there", "1")
        b = _cache_key("Hello there", "2")
        assert a != b


class TestComputeCost:
    def test_uses_gpt4o_mini_pricing(self) -> None:
        # 1M input tokens at $0.15, 1M output tokens at $0.60.
        cost = _compute_cost(1_000_000, 1_000_000)
        assert cost == Decimal("0.750000")

    def test_typical_call_under_a_cent(self) -> None:
        # Realistic per-pet call: ~250 input, ~150 output.
        cost = _compute_cost(250, 150)
        assert cost < Decimal("0.001")

    def test_zero_when_zero_tokens(self) -> None:
        assert _compute_cost(0, 0) == Decimal("0")


# --- Low-confidence fields -----------------------------------------------


class TestLowConfidenceFields:
    def test_all_high_returns_empty(self) -> None:
        attrs = _attrs()  # everything at 0.9
        assert _low_confidence_fields(attrs) == []

    def test_picks_up_threshold_misses(self) -> None:
        attrs = _attrs(hdb_conf=0.4, age_conf=0.6)
        assert sorted(_low_confidence_fields(attrs)) == ["age_months", "hdb_approved"]

    def test_boundary_at_threshold(self) -> None:
        # CONFIDENCE_THRESHOLD itself is not flagged — strict `<`.
        attrs = _attrs(hdb_conf=CONFIDENCE_THRESHOLD)
        assert "hdb_approved" not in _low_confidence_fields(attrs)


# --- extract_attributes integration --------------------------------------


class TestExtractAttributesEmptyDescription:
    def test_returns_none_for_empty_string(self) -> None:
        db = _FakeDB()
        openai = _FakeOpenAI()
        assert (
            extract_attributes("", db_client=db, openai_client=openai, today=FROZEN_TODAY)
            is None
        )
        assert openai.call_count == 0

    def test_returns_none_for_whitespace(self) -> None:
        db = _FakeDB()
        openai = _FakeOpenAI()
        assert (
            extract_attributes("   \n  ", db_client=db, openai_client=openai, today=FROZEN_TODAY)
            is None
        )
        assert openai.call_count == 0


class TestExtractAttributesHappyPath:
    def test_calls_llm_and_returns_result(self) -> None:
        db = _FakeDB()
        attrs = _attrs(tags=["senior", "shy"])
        openai = _FakeOpenAI(_completion(attrs, prompt=300, output=140))

        result = extract_attributes(
            "Mochi is a senior cat, very shy.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert result is not None
        assert result.cached is False
        assert result.attributes == attrs
        assert result.input_tokens == 300
        assert result.output_tokens == 140
        assert openai.call_count == 1
        assert "Mochi is a senior cat" in openai.last_user_content

    def test_accrues_cost_to_today_row(self) -> None:
        db = _FakeDB()
        attrs = _attrs()
        openai = _FakeOpenAI(_completion(attrs, prompt=400, output=200))

        extract_attributes(
            "A description.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        cost_rows = db.rows("cost_log")
        assert len(cost_rows) == 1
        row = cost_rows[0]
        assert row["date"] == FROZEN_TODAY.isoformat()
        assert row["llm_calls"] == 1
        # 400*0.15/1M + 200*0.60/1M = $0.00018
        assert Decimal(str(row["llm_cost_usd"])) == Decimal("0.000180")

    def test_writes_cache_row(self) -> None:
        db = _FakeDB()
        attrs = _attrs()
        openai = _FakeOpenAI(_completion(attrs))

        extract_attributes(
            "Same desc",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        cache_rows = db.rows("extraction_cache")
        assert len(cache_rows) == 1
        row = cache_rows[0]
        assert row["cache_key"] == _cache_key("Same desc", EXTRACTION_SCHEMA_VERSION)
        assert row["schema_version"] == EXTRACTION_SCHEMA_VERSION
        assert row["llm_model"] == LLM_MODEL


class TestExtractAttributesCacheHit:
    def test_second_call_does_not_hit_llm(self) -> None:
        db = _FakeDB()
        attrs = _attrs(tags=["senior"])
        openai = _FakeOpenAI(_completion(attrs))

        first = extract_attributes(
            "Same description.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )
        second = extract_attributes(
            "Same description.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert first is not None and second is not None
        assert first.cached is False
        assert second.cached is True
        # Only one network call total.
        assert openai.call_count == 1
        # No extra cost accrued on the cache-hit branch.
        assert db.rows("cost_log")[0]["llm_calls"] == 1
        # Same attributes returned both times.
        assert second.attributes == first.attributes

    def test_different_description_misses_cache(self) -> None:
        db = _FakeDB()
        attrs_a = _attrs(size="small")
        attrs_b = _attrs(size="large")
        openai = _FakeOpenAI(_completion(attrs_a), _completion(attrs_b))

        first = extract_attributes(
            "Desc A", db_client=db, openai_client=openai, today=FROZEN_TODAY
        )
        second = extract_attributes(
            "Desc B", db_client=db, openai_client=openai, today=FROZEN_TODAY
        )

        assert first is not None and second is not None
        assert first.attributes.size == "small"
        assert second.attributes.size == "large"
        assert openai.call_count == 2


class TestExtractAttributesDailyCap:
    def test_returns_none_when_cap_already_reached(self) -> None:
        db = _FakeDB()
        # Pre-fill today's row at the cap. The wrapper should short-circuit
        # before calling the LLM.
        db.rows("cost_log").append(
            {
                "date": FROZEN_TODAY.isoformat(),
                "llm_calls": 999,
                "llm_cost_usd": str(DAILY_CAP_USD),
            }
        )
        openai = _FakeOpenAI()  # no canned responses; any LLM call would crash

        result = extract_attributes(
            "Some description text.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert result is None
        assert openai.call_count == 0

    def test_returns_none_when_cap_exceeded(self) -> None:
        db = _FakeDB()
        db.rows("cost_log").append(
            {
                "date": FROZEN_TODAY.isoformat(),
                "llm_calls": 999,
                "llm_cost_usd": str(DAILY_CAP_USD + Decimal("0.01")),
            }
        )
        openai = _FakeOpenAI()

        result = extract_attributes(
            "Some description text.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )
        assert result is None

    def test_call_proceeds_when_under_cap(self) -> None:
        db = _FakeDB()
        db.rows("cost_log").append(
            {
                "date": FROZEN_TODAY.isoformat(),
                "llm_calls": 1,
                "llm_cost_usd": "0.100000",
            }
        )
        openai = _FakeOpenAI(_completion(_attrs(), prompt=100, output=80))

        result = extract_attributes(
            "Some description text.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert result is not None
        assert openai.call_count == 1
        # Cost added to the existing row, not a duplicate insert.
        rows = db.rows("cost_log")
        assert len(rows) == 1
        assert rows[0]["llm_calls"] == 2


class TestExtractAttributesTagFiltering:
    def test_drops_out_of_vocab_tags(self) -> None:
        # The model occasionally invents synonyms — they must be stripped
        # before the caller stores them on the pet row.
        db = _FakeDB()
        attrs = _attrs(tags=["senior", "fluffy", "good_with_kids", "rocket"])
        openai = _FakeOpenAI(_completion(attrs))

        result = extract_attributes(
            "Fluffy senior dog, kid-friendly.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert result is not None
        assert result.attributes.tags == ["senior", "good_with_kids"]
        # Each kept tag is part of the controlled vocabulary.
        for t in result.attributes.tags:
            assert t in TAG_VOCABULARY


class TestExtractAttributesLowConfidence:
    def test_flags_below_threshold(self) -> None:
        db = _FakeDB()
        attrs = _attrs(hdb_conf=0.4, energy_conf=0.5)
        openai = _FakeOpenAI(_completion(attrs))

        result = extract_attributes(
            "Some description.",
            db_client=db,
            openai_client=openai,
            today=FROZEN_TODAY,
        )

        assert result is not None
        assert sorted(result.low_confidence_fields) == ["energy_level", "hdb_approved"]


class TestExtractAttributesRefusal:
    def test_raises_when_parse_is_none(self) -> None:
        db = _FakeDB()
        openai = _FakeOpenAI(_FakeCompletion(parsed=None, usage=_FakeUsage(50, 0)))

        with pytest.raises(RuntimeError, match="no parse"):
            extract_attributes(
                "Some description.",
                db_client=db,
                openai_client=openai,
                today=FROZEN_TODAY,
            )


# --- apply_extraction ----------------------------------------------------


from db import apply_extraction  # noqa: E402  — local import to keep this section self-contained
from extraction import ExtractionResult  # noqa: E402


def _result(
    attrs: ExtractedAttributes,
    *,
    low_confidence: list[str] | None = None,
) -> ExtractionResult:
    return ExtractionResult(
        attributes=attrs,
        low_confidence_fields=low_confidence
        if low_confidence is not None
        else _low_confidence_fields(attrs),
        input_tokens=200,
        output_tokens=100,
        cost_usd=Decimal("0.0001"),
        cached=False,
    )


def _pet_row(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "pet-1",
        "source": "spca",
        "source_id": "sphinx",
        "hdb_approved": None,
        "size": None,
        "age_months": None,
        "energy_level": None,
        "tags": [],
        "low_confidence_fields": [],
    }
    base.update(overrides)
    return base


class TestApplyExtraction:
    def test_fills_null_columns_from_llm(self) -> None:
        db = _FakeDB()
        db.rows("pets").append(_pet_row())
        result = _result(_attrs(hdb_approved=True, size="small", age_months=24, energy="medium"))

        wrote = apply_extraction(db, "spca", "sphinx", result=result)  # type: ignore[arg-type]

        assert wrote is True
        row = db.rows("pets")[0]
        assert row["hdb_approved"] is True
        assert row["size"] == "small"
        assert row["age_months"] == 24
        assert row["energy_level"] == "medium"

    def test_preserves_scraper_provided_values(self) -> None:
        # Scrapers that read structured shelter fields (e.g., SOSD's "HDB:
        # Yes/No") are ground truth and must beat the LLM's guess.
        db = _FakeDB()
        db.rows("pets").append(
            _pet_row(hdb_approved=False, age_months=120)
        )
        result = _result(_attrs(hdb_approved=True, age_months=24))

        apply_extraction(db, "spca", "sphinx", result=result)  # type: ignore[arg-type]

        row = db.rows("pets")[0]
        assert row["hdb_approved"] is False
        assert row["age_months"] == 120

    def test_merges_tags_dedup_preserves_order(self) -> None:
        db = _FakeDB()
        db.rows("pets").append(_pet_row(tags=["Senior", "Shy & Skittish"]))
        result = _result(_attrs(tags=["senior", "shy"]))

        apply_extraction(db, "spca", "sphinx", result=result)  # type: ignore[arg-type]

        row = db.rows("pets")[0]
        # Scraper tags first, controlled-vocab LLM tags after, no duplicates.
        assert row["tags"] == ["Senior", "Shy & Skittish", "senior", "shy"]

    def test_no_update_when_nothing_to_write(self) -> None:
        # Pet already filled; LLM has nothing more to offer.
        db = _FakeDB()
        db.rows("pets").append(
            _pet_row(
                hdb_approved=True, size="small", age_months=24, energy_level="medium",
                tags=["senior"],
            )
        )
        result = _result(_attrs(tags=["senior"]))

        wrote = apply_extraction(db, "spca", "sphinx", result=result)  # type: ignore[arg-type]
        assert wrote is False

    def test_low_confidence_only_for_written_columns(self) -> None:
        # hdb_approved is scraper-provided, so its (low) confidence is
        # irrelevant — it must NOT appear in low_confidence_fields.
        db = _FakeDB()
        db.rows("pets").append(_pet_row(hdb_approved=False))
        result = _result(
            _attrs(hdb_approved=True, hdb_conf=0.2, size="large", size_conf=0.4),
        )

        apply_extraction(db, "spca", "sphinx", result=result)  # type: ignore[arg-type]

        row = db.rows("pets")[0]
        # hdb_approved was not touched, so its low-confidence doesn't count.
        assert row["hdb_approved"] is False
        assert row["size"] == "large"
        assert row["low_confidence_fields"] == ["size"]

    def test_returns_false_when_pet_not_found(self) -> None:
        db = _FakeDB()
        # No pet row inserted.
        result = _result(_attrs())
        wrote = apply_extraction(db, "spca", "missing", result=result)  # type: ignore[arg-type]
        assert wrote is False
