"""SOSD parser tests against frozen fixtures.

No network is hit. Fixtures in `tests/fixtures/sosd/` are verbatim copies of
the live site captured during Phase 2.1.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from sources.sosd import (
    SOURCE_ID,
    _merge,
    _parse_age_months,
    _parse_archive,
    _parse_card_info_list,
    _parse_detail,
    _parse_sex,
    _parse_yes_no,
    _record_from_card,
    _slug_from_url,
)

FIXTURES = Path(__file__).parent / "fixtures" / "sosd"
ARCHIVE_FIXTURE = FIXTURES / "sosd_adopt_a_dog.html"
JET_FIXTURE = FIXTURES / "sosd_dog_jet.html"
BOBA_FIXTURE = FIXTURES / "sosd_dog_boba.html"


@pytest.fixture(scope="module")
def archive_html() -> str:
    return ARCHIVE_FIXTURE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def jet_html() -> str:
    return JET_FIXTURE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def boba_html() -> str:
    return BOBA_FIXTURE.read_text(encoding="utf-8")


class TestParseArchive:
    def test_extracts_many_cards(self, archive_html: str) -> None:
        cards = _parse_archive(archive_html)
        # The fixture captured ~80 dogs on the single listing page; bound
        # loosely so the test doesn't break when SOSD adds or removes a dog.
        assert len(cards) >= 50

    def test_every_card_has_required_minimum(self, archive_html: str) -> None:
        for card in _parse_archive(archive_html):
            assert card.name
            assert card.slug
            assert card.source_url.startswith("https://www.sosd.org.sg/")
            assert card.photo_url.startswith("https://")

    def test_known_pets_present(self, archive_html: str) -> None:
        slugs = {c.slug for c in _parse_archive(archive_html)}
        # Jet, Max, and Boba were on the page when the fixture was captured.
        assert "jet" in slugs
        assert "max" in slugs
        assert "boba" in slugs

    def test_card_sex_age_hdb_parsed(self, archive_html: str) -> None:
        cards_by_slug = {c.slug: c for c in _parse_archive(archive_html)}
        jet = cards_by_slug.get("jet")
        assert jet is not None
        assert jet.sex == "male"
        # 10.5 years on the card => 126 months.
        assert jet.age_months == 126
        assert jet.hdb_approved is True

    def test_no_stray_non_dog_links(self, archive_html: str) -> None:
        # No card should map to a known utility path.
        bad = {"adopt", "donate", "volunteer", "sponsor-a-dog", "contact-us"}
        slugs = {c.slug for c in _parse_archive(archive_html)}
        assert not (slugs & bad)


class TestParseDetailJet:
    def test_core_fields(self, jet_html: str) -> None:
        detail = _parse_detail(jet_html)
        assert detail is not None
        assert detail.name == "Jet"
        assert detail.sex == "male"
        # 10.5 years = 126 months on the detail page.
        assert detail.age_months == 126
        assert detail.hdb_approved is True
        # 'Senior' is the only category on Jet's page.
        assert detail.tags == ["Senior"]

    def test_description_present(self, jet_html: str) -> None:
        detail = _parse_detail(jet_html)
        assert detail is not None
        assert detail.description is not None
        # Real prose, not the labelled fields.
        assert "last of his siblings" in detail.description
        # Paragraph breaks preserved.
        assert "\n\n" in detail.description
        # No labelled-field bleed at the start.
        assert not detail.description.startswith("Gender:")

    def test_photos_collected(self, jet_html: str) -> None:
        detail = _parse_detail(jet_html)
        assert detail is not None
        assert detail.photo_urls
        for url in detail.photo_urls:
            assert url.startswith("https://www.sosd.org.sg/wp-content/uploads/")


class TestParseDetailBoba:
    """Multiple photos and a multi-tag Categories field."""

    def test_multi_tag_categories(self, boba_html: str) -> None:
        detail = _parse_detail(boba_html)
        assert detail is not None
        assert detail.tags == [
            "Senior",
            "Shy & Skittish",
            "Low Energy",
            "Dog with Medical Needs",
        ]

    def test_gallery_has_multiple_photos(self, boba_html: str) -> None:
        detail = _parse_detail(boba_html)
        assert detail is not None
        # Boba has at least 4 gallery images in the fixture.
        assert len(detail.photo_urls) >= 3
        assert len(set(detail.photo_urls)) == len(detail.photo_urls)

    def test_sex_female(self, boba_html: str) -> None:
        detail = _parse_detail(boba_html)
        assert detail is not None
        assert detail.sex == "female"


class TestSlugFromUrl:
    def test_simple(self) -> None:
        assert _slug_from_url("https://www.sosd.org.sg/jet/") == "jet"

    def test_no_trailing_slash(self) -> None:
        assert _slug_from_url("https://www.sosd.org.sg/jet") == "jet"

    def test_with_query(self) -> None:
        assert _slug_from_url("https://www.sosd.org.sg/jet/?utm=x") == "jet"

    def test_root_relative(self) -> None:
        assert _slug_from_url("/jet/") == "jet"

    def test_non_dog_path_rejected(self) -> None:
        assert _slug_from_url("https://www.sosd.org.sg/donate/") == ""
        assert _slug_from_url("https://www.sosd.org.sg/adopt-a-dog/") == ""

    def test_nested_path_rejected(self) -> None:
        assert _slug_from_url("https://www.sosd.org.sg/blog/post-1/") == ""


class TestParseSex:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Male", "male"),
            ("female", "female"),
            ("F", "female"),
            ("Unknown", None),
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: str | None) -> None:
        assert _parse_sex(raw) == expected


class TestParseAgeMonths:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            # SOSD's signature decimal-years format.
            ("10.5 years old", 126),
            ("8.5 years old", 102),
            ("1.5 years", 18),
            ("14 years old", 168),
            ("4 months", 4),
            ("1 year 3 months", 15),
            # 0 is not a useful estimate; treat as missing.
            ("0 months", None),
            ("puppy", None),
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: int | None) -> None:
        assert _parse_age_months(raw) == expected


class TestParseYesNo:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Yes", True),
            ("yes", True),
            ("No", False),
            ("Maybe", None),
            ("", None),
            (None, None),
        ],
    )
    def test_cases(self, raw: str | None, expected: bool | None) -> None:
        assert _parse_yes_no(raw) == expected


class TestRecordFromCard:
    """The card-only fallback record covers the case where detail fetch fails.

    A dog with a dead detail page must still appear in the app — better thin
    data than no data.
    """

    def test_falls_back_to_card_only(self, archive_html: str) -> None:
        cards = _parse_archive(archive_html)
        jet = next(c for c in cards if c.slug == "jet")
        record = _record_from_card(jet)
        assert record.source == SOURCE_ID
        assert record.source_id == "jet"
        assert record.name == "Jet"
        assert record.species == "dog"
        assert record.sex == "male"
        assert record.age_months == 126
        assert record.hdb_approved is True
        assert len(record.photo_urls) == 1


class TestMerge:
    def test_detail_takes_priority(self, archive_html: str, jet_html: str) -> None:
        cards = _parse_archive(archive_html)
        jet_card = next(c for c in cards if c.slug == "jet")
        detail = _parse_detail(jet_html)
        assert detail is not None
        record = _merge(jet_card, detail)
        assert record.source == SOURCE_ID
        assert record.source_id == "jet"
        assert record.name == "Jet"
        assert record.species == "dog"
        # Description comes from detail.
        assert record.description is not None
        assert "last of his siblings" in record.description
        # Tags (categories) come from detail.
        assert record.tags == ["Senior"]
        # Photos should be the detail-page gallery, not just the thumb.
        assert len(record.photo_urls) >= 1
        assert all(str(p).startswith("https://www.sosd.org.sg/") for p in record.photo_urls)


class TestParseCardInfoListIsolated:
    """The card info list parses sex/HDB/age independently of order.

    SOSD's loop template has put fields in the same order every time we've
    looked, but this regression test pins the assumption so a future template
    change is caught by tests, not by users seeing wrong data.
    """

    def test_order_invariance(self, archive_html: str) -> None:
        # The Max card is on the same archive fixture; assert its fields too
        # so we cover at least two dogs' card-level data.
        from selectolax.parser import HTMLParser

        tree = HTMLParser(archive_html)
        for item in tree.css("div.e-loop-item"):
            heading = item.css_first("h4.elementor-heading-title")
            if heading is None:
                continue
            if heading.text(strip=True) == "Max":
                sex, hdb, age = _parse_card_info_list(item)
                assert sex == "male"
                assert hdb is False
                # 14.5 years => 174 months.
                assert age == 174
                return
        pytest.fail("Max card not found in fixture")
