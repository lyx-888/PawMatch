"""Unit tests for db.py.

Supabase calls are mocked — these verify our helpers shape the right
PostgREST requests, not that Supabase itself works.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from base import PetRecord
from db import (
    GRACE_PERIOD_DAYS,
    get_db_client,
    mark_gone,
    record_run,
    upsert_pet,
    upsert_pets,
)


def _record(**overrides: object) -> PetRecord:
    defaults: dict[str, object] = {
        "source": "spca",
        "source_id": "abc-1",
        "source_url": "https://spca.org.sg/adoptions/abc-1",
        "name": "Bao",
        "species": "dog",
    }
    defaults.update(overrides)
    return PetRecord(**defaults)  # type: ignore[arg-type]


class _Captured:
    """Tiny helper that captures PostgREST chain calls into one place."""

    def __init__(self, return_data: list[dict[str, Any]] | None = None) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self._return_data = return_data or []

    def _record(self, name: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> _Captured:
        self.calls.append((name, args, kwargs))
        return self

    def __getattr__(self, name: str) -> Any:
        def f(*args: Any, **kwargs: Any) -> _Captured:
            return self._record(name, args, kwargs)

        return f

    def execute(self) -> Any:
        self.calls.append(("execute", (), {}))
        response = MagicMock()
        response.data = self._return_data
        return response


def _client_with(captured: _Captured) -> MagicMock:
    client = MagicMock()
    client.table.return_value = captured
    return client


class TestGetDbClient:
    def test_missing_url_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "x")
        with pytest.raises(RuntimeError):
            get_db_client()

    def test_missing_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
        with pytest.raises(RuntimeError):
            get_db_client()


class TestUpsertPet:
    def test_sends_payload_keyed_on_source(self) -> None:
        captured = _Captured(return_data=[{"id": "uuid-1"}])
        client = _client_with(captured)

        upsert_pet(client, _record())

        client.table.assert_called_once_with("pets")
        upsert_call = next(c for c in captured.calls if c[0] == "upsert")
        payload = upsert_call[1][0]
        assert payload["source"] == "spca"
        assert payload["source_id"] == "abc-1"
        assert "first_seen_at" not in payload  # let the DB default fire on insert
        assert payload["last_seen_at"]
        assert payload["scraped_at"] == payload["last_seen_at"]
        assert upsert_call[2]["on_conflict"] == "source,source_id"

    def test_serializes_url_as_string(self) -> None:
        captured = _Captured()
        client = _client_with(captured)

        upsert_pet(client, _record(photo_urls=["https://cdn.spca.org.sg/a.jpg"]))

        payload = next(c for c in captured.calls if c[0] == "upsert")[1][0]
        assert payload["photo_urls"] == ["https://cdn.spca.org.sg/a.jpg"]
        assert payload["source_url"] == "https://spca.org.sg/adoptions/abc-1"


class TestUpsertPetsBatch:
    def test_empty_list_skips_call(self) -> None:
        client = MagicMock()
        assert upsert_pets(client, []) == 0
        client.table.assert_not_called()

    def test_writes_all_records(self) -> None:
        captured = _Captured(return_data=[{"id": "u1"}, {"id": "u2"}])
        client = _client_with(captured)
        records = [_record(source_id="a"), _record(source_id="b")]

        n = upsert_pets(client, records)

        assert n == 2
        upsert_call = next(c for c in captured.calls if c[0] == "upsert")
        payload = upsert_call[1][0]
        assert [r["source_id"] for r in payload] == ["a", "b"]


class TestMarkGone:
    def test_filters_correctly(self) -> None:
        captured = _Captured(return_data=[{"id": "u1"}, {"id": "u2"}])
        client = _client_with(captured)

        n = mark_gone(client, "spca", ["a", "b"])

        assert n == 2
        ops = [c[0] for c in captured.calls]
        assert ops == ["update", "eq", "in_", "lt", "filter", "execute"]
        update_payload = captured.calls[0][1][0]
        assert update_payload == {
            "status": "gone",
            "status_reason": "not seen on source",
        }
        assert captured.calls[1][1] == ("source", "spca")
        assert captured.calls[2][1] == ("status", ["available", "pending"])
        assert captured.calls[4][1] == ("source_id", "not.in", '("a","b")')

    def test_no_seen_ids_skips_not_in_filter(self) -> None:
        captured = _Captured()
        client = _client_with(captured)

        mark_gone(client, "spca", [])

        ops = [c[0] for c in captured.calls]
        assert "filter" not in ops

    def test_grace_period_default(self) -> None:
        assert GRACE_PERIOD_DAYS == 3


class TestRecordRun:
    def test_inserts_summary(self) -> None:
        captured = _Captured(return_data=[{"id": 42}])
        client = _client_with(captured)

        run_id = record_run(
            client,
            "spca",
            status="success",
            pets_found=10,
            pets_updated=10,
            pets_marked_gone=2,
        )

        assert run_id == 42
        insert_call = next(c for c in captured.calls if c[0] == "insert")
        payload = insert_call[1][0]
        assert payload["source"] == "spca"
        assert payload["status"] == "success"
        assert payload["pets_found"] == 10
        assert payload["pets_updated"] == 10
        assert payload["pets_marked_gone"] == 2

    def test_failed_run_passes_error_message(self) -> None:
        captured = _Captured(return_data=[{"id": 1}])
        client = _client_with(captured)

        record_run(client, "spca", status="failed", error_message="403 from origin")

        payload = next(c for c in captured.calls if c[0] == "insert")[1][0]
        assert payload["status"] == "failed"
        assert payload["error_message"] == "403 from origin"
