"""OSCAS parser tests against a frozen gallery fixture.

OSCAS has no per-pet detail page; the entire gallery is parsed from one HTML
file. The fixture in `tests/fixtures/oscas/oscas_adoption_gallery.html` is a
verbatim copy of the live gallery captured during Phase 2.1.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from sources.oscas import (
    GALLERY_URL,
    SOURCE_ID,
    _age_months_from_year,
    _parse_hdb,
    _parse_sex,
    _parse_sterilized,
    _parse_temperament,
    _parse_year,
    _slugify,
    parse_gallery,
)

FIXTURES = Path(__file__).parent / "fixtures" / "oscas"
GALLERY_FIXTURE = FIXTURES / "oscas_adoption_gallery.html"

# Pin "today" so age computations are deterministic — the fixture was taken
# while CLAUDE.md noted today's date as 2026-05-12.
FROZEN_TODAY = datetime(2026, 5, 12, tzinfo=UTC)


@pytest.fixture(scope="module")
def gallery_html() -> str:
    return GALLERY_FIXTURE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def pets(gallery_html: str) -> list:
    return parse_gallery(gallery_html, today=FROZEN_TODAY)


class TestParseGalleryShape:
    def test_returns_many_pets(self, pets: list) -> None:
        # The fixture has ~60+ pets; bound loosely so the test doesn't break
        # when OSCAS adds or removes a dog.
        assert len(pets) >= 40

    def test_every_pet_has_required_fields(self, pets: list) -> None:
        for record in pets:
            assert record.source == SOURCE_ID
            assert record.source_id
            assert record.name
            assert record.species == "dog"
            assert str(record.source_url) == GALLERY_URL

    def test_known_pets_present(self, pets: list) -> None:
        slugs = {r.source_id for r in pets}
        assert "teddy" in slugs
        assert "sam-bao" in slugs
        assert "sparkle" in slugs

    def test_pets_have_unique_slugs(self, pets: list) -> None:
        slugs = [r.source_id for r in pets]
        assert len(slugs) == len(set(slugs)), "duplicate source_ids would clobber rows on upsert"


class TestTeddy:
    """Teddy is the first pet on the page — pin its fields hard."""

    @pytest.fixture
    def teddy(self, pets: list):
        for r in pets:
            if r.source_id == "teddy":
                return r
        pytest.fail("Teddy not found in gallery fixture")

    def test_sex(self, teddy) -> None:
        assert teddy.sex == "male"

    def test_age_from_born_in_2019(self, teddy) -> None:
        # Born in 2019 (estimate), today 2026-05-12 — about 7 years => 84 months
        # using the mid-year birth assumption. We allow ±1 month for the
        # day-of-year arithmetic.
        assert teddy.age_months is not None
        assert 82 <= teddy.age_months <= 86

    def test_not_hdb(self, teddy) -> None:
        assert teddy.hdb_approved is False

    def test_sterilized_tag(self, teddy) -> None:
        assert "sterilized" in teddy.tags

    def test_temperament_tag(self, teddy) -> None:
        # The temperament bullet "Temperament: Shy, wary but growing in confidence"
        # becomes a tag verbatim.
        assert any("Shy" in t for t in teddy.tags)

    def test_description(self, teddy) -> None:
        assert teddy.description is not None
        # Real prose from the gallery, not bullet bleed.
        assert "rescued along with his brother Tommy" in teddy.description
        # The bullets must NOT have leaked into the description.
        assert "Sterilized" not in teddy.description
        assert "HDB Approved" not in teddy.description
        # Paragraph breaks preserved.
        assert "\n\n" in teddy.description

    def test_photos(self, teddy) -> None:
        assert teddy.photo_urls
        for url in teddy.photo_urls:
            assert "squarespace-cdn.com" in str(url)


class TestDisambiguatedDuplicateNames:
    """Two pets named 'Paris' must end up with distinct source_ids.

    The fixture has 'Paris (madamemoiselle)' and 'Paris (monsieur)' as
    separate entries; both must be returned and both must be upsertable.
    """

    def test_paris_pair_present(self, pets: list) -> None:
        paris_records = [r for r in pets if r.name.lower().startswith("paris")]
        assert len(paris_records) == 2
        ids = {r.source_id for r in paris_records}
        assert len(ids) == 2


class TestSlugify:
    @pytest.mark.parametrize(
        "name,expected",
        [
            ("Teddy", "teddy"),
            ("Sam Bao", "sam-bao"),
            ("Mei Mei", "mei-mei"),
            ("Paris (madamemoiselle)", "paris-madamemoiselle"),
            ("Furry Girl", "furry-girl"),
            ("Old Mack", "old-mack"),
        ],
    )
    def test_cases(self, name: str, expected: str) -> None:
        assert _slugify(name) == expected


class TestParseHdb:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("HDB Approved", True),
            ("Not HDB Approved", False),
            ("NOT HDB Approved", False),
            ("Sterilized", None),  # different bullet — must not match
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: bool | None) -> None:
        assert _parse_hdb(raw) == expected


class TestParseSterilized:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Sterilized", True),
            ("Sterilised", True),  # British spelling — same shelter sometimes uses it
            ("Not Sterilized", False),
            ("Male", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: bool | None) -> None:
        assert _parse_sterilized(raw) == expected


class TestParseTemperament:
    def test_strips_label(self) -> None:
        assert (
            _parse_temperament("Temperament: Shy, wary but growing in confidence")
            == "Shy, wary but growing in confidence"
        )

    def test_no_label_returns_none(self) -> None:
        assert _parse_temperament("Male") is None

    def test_empty_value_returns_none(self) -> None:
        assert _parse_temperament("Temperament:") is None


class TestParseYear:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Born in 2019 (estimate)", 2019),
            ("Born in 2024", 2024),
            ("Born in 1985", None),  # implausibly old; rejected
            ("Born in 2099", None),  # in the future; rejected
            ("Male", None),
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: int | None) -> None:
        assert _parse_year(raw) == expected


class TestAgeFromYear:
    def test_simple_seven_years(self) -> None:
        months = _age_months_from_year(2019, now=FROZEN_TODAY)
        assert months is not None
        # 2019-07-01 to 2026-05-12 ≈ 6.9 years => ~83 months
        assert 82 <= months <= 86

    def test_future_year_returns_none(self) -> None:
        assert _age_months_from_year(2030, now=FROZEN_TODAY) is None

    def test_none_year_returns_none(self) -> None:
        assert _age_months_from_year(None, now=FROZEN_TODAY) is None


class TestParseSex:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Male", "male"),
            ("female", "female"),
            ("Not Sterilized", None),  # bullet text but not a sex field
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: str | None) -> None:
        assert _parse_sex(raw) == expected
