"""SPCA parser tests against a frozen archive-page fixture.

Live network is never hit here. The fixture in `tests/fixtures/spca_animal_index.html`
is a verbatim copy of https://spca.org.sg/animal/ captured during Phase 1.3.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from sources.spca import (
    ADOPTABLE_PROGRAMMES,
    _merge,
    _parse_age_months,
    _parse_archive,
    _parse_detail,
    _parse_sex,
    _programme_from_classes,
    _slug_from_url,
    _wp_strip_size,
)

FIXTURES = Path(__file__).parent / "fixtures"
ARCHIVE_FIXTURE = FIXTURES / "spca_animal_index.html"
DETAIL_FIXTURE = FIXTURES / "spca_animal_sphinx.html"


@pytest.fixture(scope="module")
def archive_html() -> str:
    return ARCHIVE_FIXTURE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def detail_html() -> str:
    return DETAIL_FIXTURE.read_text(encoding="utf-8")


class TestParseArchive:
    def test_extracts_all_visible_cards(self, archive_html: str) -> None:
        cards = _parse_archive(archive_html)
        # First archive page captured 12 pets; SPCA renders 12 cards per page.
        assert len(cards) == 12

    def test_every_card_has_required_minimum(self, archive_html: str) -> None:
        for card in _parse_archive(archive_html):
            assert card.name
            assert card.source_url.startswith("https://spca.org.sg/animal/")
            assert card.photo_url.startswith("https://")
            assert card.programme  # not empty

    def test_known_pet_present(self, archive_html: str) -> None:
        names = [c.name for c in _parse_archive(archive_html)]
        # Sphinx and Cosmo and Luna were both on the page when the fixture was captured.
        assert "Sphinx" in names
        assert "Cosmo and Luna" in names

    def test_programme_distribution(self, archive_html: str) -> None:
        programmes = [c.programme for c in _parse_archive(archive_html)]
        # Both adoption and rehoming should appear; we don't assert exact counts
        # because the fixture's snapshot will drift over time.
        assert "rehoming" in programmes
        assert "adoption" in programmes


class TestProgrammeFromClasses:
    def test_recognises_adoption(self) -> None:
        assert _programme_from_classes("sam-animal-card sam-programme-adoption") == "adoption"

    def test_recognises_rehoming(self) -> None:
        assert _programme_from_classes("sam-animal-card sam-programme-rehoming") == "rehoming"

    def test_unknown_returns_empty(self) -> None:
        assert _programme_from_classes("sam-animal-card") == ""


class TestSlugFromUrl:
    def test_simple(self) -> None:
        assert _slug_from_url("https://spca.org.sg/animal/sphinx/") == "sphinx"

    def test_numbered_suffix(self) -> None:
        assert _slug_from_url("https://spca.org.sg/animal/sesame-2/") == "sesame-2"

    def test_with_query_string(self) -> None:
        assert _slug_from_url("https://spca.org.sg/animal/sphinx/?utm=x") == "sphinx"

    def test_non_animal_url(self) -> None:
        assert _slug_from_url("https://spca.org.sg/donate/") == ""


class TestParseDetail:
    def test_extracts_core_fields(self, detail_html: str) -> None:
        detail = _parse_detail(detail_html)
        assert detail is not None
        assert detail.name == "Sphinx"
        assert detail.species == "dog"
        assert detail.sex == "male"
        # 1 year 3 months = 15 months
        assert detail.age_months == 15
        assert detail.breed == "shetland crossbreed"
        assert detail.description
        assert "love to run" in detail.description.lower()

    def test_photo_urls_full_size_and_deduped(self, detail_html: str) -> None:
        detail = _parse_detail(detail_html)
        assert detail is not None
        assert detail.photo_urls
        for url in detail.photo_urls:
            # Thumbnail suffixes should be stripped before storage.
            assert "-150x150" not in url
            assert "-300x300" not in url
        assert len(set(detail.photo_urls)) == len(detail.photo_urls)
        # The detail-page main image should be first.
        assert detail.photo_urls[0].endswith("IMG_0216.jpg")


class TestParseSex:
    @pytest.mark.parametrize("raw,expected", [
        ("Male", "male"),
        ("male", "male"),
        ("Female", "female"),
        ("F", "female"),
        ("Unknown", None),
        ("", None),
        (None, None),
    ])
    def test_cases(self, raw: str | None, expected: str | None) -> None:
        assert _parse_sex(raw) == expected


class TestParseAgeMonths:
    @pytest.mark.parametrize("raw,expected", [
        ("7 years", 84),
        ("1 year 3 months", 15),
        ("4 months", 4),
        ("2 yrs", 24),
        ("0 months", None),  # 0 is not a useful estimate; treat as missing
        ("puppy", None),
        ("", None),
        (None, None),
    ])
    def test_cases(self, raw: str | None, expected: int | None) -> None:
        assert _parse_age_months(raw) == expected


class TestWpStripSize:
    def test_strips_thumb_suffix(self) -> None:
        assert (
            _wp_strip_size("https://x/img-150x150.jpg") == "https://x/img.jpg"
        )

    def test_leaves_full_size_alone(self) -> None:
        assert _wp_strip_size("https://x/img.jpg") == "https://x/img.jpg"

    def test_handles_webp(self) -> None:
        assert _wp_strip_size("https://x/img-300x300.webp") == "https://x/img.webp"


class TestMerge:
    def test_uses_detail_photos_when_present(
        self, archive_html: str, detail_html: str
    ) -> None:
        cards = [c for c in _parse_archive(archive_html) if c.programme in ADOPTABLE_PROGRAMMES]
        detail = _parse_detail(detail_html)
        assert cards and detail is not None
        record = _merge(cards[0], detail, _slug_from_url(cards[0].source_url))
        assert record.source == "spca"
        assert record.name == "Sphinx"
        assert record.species == "dog"
        # The detail gallery has several photos; the archive thumb has one.
        assert len(record.photo_urls) > 1
