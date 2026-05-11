"""SPCA Singapore scraper.

SPCA's site is a WordPress install. Adoptable pets live at /animal/{slug}/, and
the paginated archive at /animal/?paged={n} lists 12 cards per page. The cards
expose name, primary photo, source URL, programme (adoption / rehoming /
fostering / lost-found), and a status badge. The detail page adds the structured
fields the matching engine needs: species, sex, age, breed, description, gallery.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser

from base import PetRecord, Sex, Species, Status, get_http_client

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://spca.org.sg/animal/"
ADOPTABLE_PROGRAMMES = frozenset({"adoption", "rehoming"})
SOURCE_ID = "spca"

# Stripping WordPress' -WxH suffix gives the original-resolution upload.
_WP_SIZE_SUFFIX_RE = re.compile(r"-\d+x\d+(?=\.(?:jpe?g|png|webp|gif)$)", re.IGNORECASE)

_ANIMAL_TYPE_TO_SPECIES: dict[str, Species] = {
    "dog": "dog",
    "dogs": "dog",
    "cat": "cat",
    "cats": "cat",
    "rabbit": "rabbit",
    "rabbits": "rabbit",
}


@dataclass(frozen=True)
class _Card:
    name: str
    photo_url: str
    source_url: str
    programme: str
    status: str


@dataclass(frozen=True)
class _Detail:
    name: str
    species: Species
    sex: Sex | None
    age_months: int | None
    breed: str | None
    description: str | None
    photo_urls: list[str]


def scrape(*, max_pages: int = 20) -> list[PetRecord]:
    """Public entry point: fetches archive pages, then detail page per pet.

    Returns one PetRecord per adoptable pet. Detail-page failures are isolated:
    one bad page does not abort the whole scrape — that pet is skipped and the
    rest proceed.
    """

    records: list[PetRecord] = []
    seen_slugs: set[str] = set()

    with get_http_client() as client:
        for page in range(1, max_pages + 1):
            url = ARCHIVE_URL if page == 1 else f"{ARCHIVE_URL}?paged={page}"
            response = client.get(url)
            if response.status_code == 404:
                break
            response.raise_for_status()
            cards = _parse_archive(response.text)
            if not cards:
                break
            for card in cards:
                slug = _slug_from_url(card.source_url)
                if not slug or slug in seen_slugs:
                    continue
                seen_slugs.add(slug)
                if card.programme not in ADOPTABLE_PROGRAMMES:
                    continue

                detail = _fetch_detail(client, card.source_url)
                if detail is None:
                    continue
                records.append(_merge(card, detail, slug))
    return records


def _fetch_detail(client: httpx.Client, url: str) -> _Detail | None:
    """Fetch a single detail page, returning None on any failure.

    Per-pet isolation: a 500 on one detail page must not kill the whole run.
    Logged so admin (Phase 5) can spot a pattern of broken detail pages.
    """

    try:
        response = client.get(url)
        response.raise_for_status()
    except httpx.HTTPError:
        logger.exception("spca detail fetch failed: %s", url)
        return None
    return _parse_detail(response.text)


def _parse_archive(html: str) -> list[_Card]:
    """Pure parser — extracts every animal card on a single archive page."""

    tree = HTMLParser(html)
    cards: list[_Card] = []
    for node in tree.css("div.sam-animal-card"):
        link = node.css_first("a")
        if not link:
            continue
        source_url = link.attributes.get("href")
        if not source_url:
            continue
        source_url = urljoin(ARCHIVE_URL, source_url)

        img = node.css_first("div.sam-card-image img")
        photo_url = img.attributes.get("src") if img else None
        if not photo_url:
            continue
        photo_url = urljoin(source_url, photo_url)

        name_node = node.css_first("h3.sam-animal-name")
        name = name_node.text(strip=True) if name_node else None
        if not name and img:
            name = (img.attributes.get("alt") or "").strip()
        if not name:
            continue

        programme = _programme_from_classes(node.attributes.get("class") or "")
        status_node = node.css_first(".sam-status-badge")
        status = status_node.text(strip=True).lower() if status_node else "available"

        cards.append(
            _Card(
                name=name,
                photo_url=photo_url,
                source_url=source_url,
                programme=programme,
                status=status,
            )
        )
    return cards


def _parse_detail(html: str) -> _Detail | None:
    """Pure parser for a /animal/{slug}/ detail page."""

    tree = HTMLParser(html)
    title_node = tree.css_first("h1.sam-animal-title")
    if not title_node:
        return None
    name = title_node.text(strip=True)
    if not name:
        return None

    fields = _extract_fields(tree)

    species = _ANIMAL_TYPE_TO_SPECIES.get(fields.get("animal type", "").lower(), "other")
    sex = _parse_sex(fields.get("gender"))
    age_months = _parse_age_months(fields.get("age"))
    breed = fields.get("breed") or None

    story_node = tree.css_first(".sam-story-content")
    description = story_node.text(strip=True) if story_node else None

    photo_urls = _collect_photos(tree)

    return _Detail(
        name=name,
        species=species,
        sex=sex,
        age_months=age_months,
        breed=breed,
        description=description,
        photo_urls=photo_urls,
    )


def _extract_fields(tree: HTMLParser) -> dict[str, str]:
    """Collect the labelled field rows into a lowercase-keyed dict.

    Labels arrive prefixed with emoji (e.g. '📅 Date Posted'); we strip those
    so a key like 'date posted' is consistent regardless of font support.
    """

    out: dict[str, str] = {}
    for row in tree.css("div.sam-field-row"):
        label_node = row.css_first(".sam-field-label")
        value_node = row.css_first(".sam-field-value")
        if not label_node or not value_node:
            continue
        label = _strip_emoji(label_node.text(strip=True)).lower()
        if label:
            out[label] = value_node.text(strip=True)
    return out


def _collect_photos(tree: HTMLParser) -> list[str]:
    """Pull the primary photo and gallery thumbs, normalised to full size.

    Thumbnails are the small CDN versions WordPress generates; stripping the
    `-WxH` suffix returns the original upload URL. Deduplicated, primary first.
    """

    urls: list[str] = []
    seen: set[str] = set()

    main = tree.css_first(".sam-main-image-wrap img")
    if main:
        src = main.attributes.get("src")
        if src:
            full = _wp_strip_size(src)
            urls.append(full)
            seen.add(full)

    for thumb in tree.css(".sam-gallery-thumb img"):
        src = thumb.attributes.get("src")
        if not src:
            continue
        full = _wp_strip_size(src)
        if full in seen:
            continue
        seen.add(full)
        urls.append(full)

    return urls


def _wp_strip_size(url: str) -> str:
    """`foo-150x150.jpg` -> `foo.jpg`. Leave non-resized URLs alone."""

    return _WP_SIZE_SUFFIX_RE.sub("", url)


def _strip_emoji(text: str) -> str:
    """Drop leading emoji/whitespace so labels collapse to plain English."""

    # Keep ASCII letters and spaces; everything else (emoji, NBSP, et al.) goes.
    return re.sub(r"[^A-Za-z ]+", "", text).strip()


def _parse_sex(raw: str | None) -> Sex | None:
    if not raw:
        return None
    raw = raw.strip().lower()
    if raw.startswith("m"):
        return "male"
    if raw.startswith("f"):
        return "female"
    return None


def _parse_age_months(raw: str | None) -> int | None:
    """Parse strings like '7 years', '1 year 3 months', '4 months'.

    Returns None if no number is present. Robust to whitespace and casing but
    deliberately not to phrases like 'puppy' — the LLM extraction (Phase 2)
    handles those.
    """

    if not raw:
        return None
    raw = raw.lower()
    years_match = re.search(r"(\d+)\s*y(?:ea)?r?s?", raw)
    months_match = re.search(r"(\d+)\s*m(?:onth)?s?", raw)
    if not years_match and not months_match:
        return None
    years = int(years_match.group(1)) if years_match else 0
    months = int(months_match.group(1)) if months_match else 0
    total = years * 12 + months
    return total if total > 0 else None


def _programme_from_classes(class_str: str) -> str:
    match = re.search(r"sam-programme-([a-z\-]+)", class_str or "")
    return match.group(1) if match else ""


def _slug_from_url(url: str) -> str:
    match = re.search(r"/animal/([^/?#]+)/?", url)
    return match.group(1) if match else ""


def _merge(card: _Card, detail: _Detail, slug: str) -> PetRecord:
    """Combine the card fields (URL, status) with the detail-page fields.

    Detail-page photos are preferred over the archive thumb because they're
    full-size and there are several of them. Archive photo only used as a
    last-resort fallback if the detail page returned no gallery.
    """

    photos = detail.photo_urls or [card.photo_url]
    status: Status = "available" if card.status == "available" else "pending"

    return PetRecord(
        source=SOURCE_ID,
        source_id=slug,
        source_url=card.source_url,  # type: ignore[arg-type]
        name=detail.name or card.name,
        species=detail.species,
        breed=detail.breed,
        sex=detail.sex,
        age_months=detail.age_months,
        description=detail.description,
        photo_urls=photos,  # type: ignore[arg-type]
        status=status,
    )
