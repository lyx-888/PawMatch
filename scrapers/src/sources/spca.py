"""SPCA Singapore scraper.

SPCA's site is a WordPress install. Adoptable pets live at /animal/{slug}/, and
the paginated archive at /animal/?paged={n} lists 12 cards per page. The cards
expose name, primary photo, source URL, programme (adoption / rehoming /
fostering / lost-found), and a status badge. The detail page adds the structured
fields the matching engine needs: species, sex, age, breed, description, gallery.

Two detail-page layouts coexist: the older one renders fields as `.sam-field-row`
label/value pairs; the newer one only carries `Species` in `.sam-quick-facts`
and inlines Name/Gender/Breed/Colour/Age into the description as
`<strong>Label:</strong> Value<br>`. The parser handles both and merges results.
"""

from __future__ import annotations

import html as html_lib
import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser, Node

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

# Labels that appear inline at the top of a description as `<strong>X:</strong> Y<br>`.
# We peel these off so the narrative starts at the first prose paragraph and the
# values supplement the structured Quick-Facts list when those are missing.
_INLINE_FIELD_LABELS: frozenset[str] = frozenset(
    {
        "name",
        "gender",
        "sex",
        "breed",
        "colour",
        "color",
        "age",
        "species",
        "animal type",
        "weight",
        "size",
    }
)


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
    description, inline_fields = _extract_story(tree)

    # Inline fields supplement the structured ones — the new SPCA layout only
    # publishes `Species` in Quick Facts and inlines the rest in the description.
    for key, value in inline_fields.items():
        fields.setdefault(key, value)

    species_raw = (fields.get("species") or fields.get("animal type") or "").lower()
    species = _ANIMAL_TYPE_TO_SPECIES.get(species_raw, "other")
    sex = _parse_sex(fields.get("gender") or fields.get("sex"))
    age_months = _parse_age_months(fields.get("age"))
    breed = fields.get("breed") or None

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
    """Collect labelled field rows into a lowercase-keyed dict.

    Supports both detail-page layouts: the older `.sam-field-row` (label/value
    pairs) and the newer `.sam-quick-facts` list. Labels arrive prefixed with
    emoji (e.g. '📅 Date Posted' or '🐾 Species'); we strip those so the key
    is consistent regardless of font support. The first source to provide a
    label wins so a `.sam-field-row` value isn't clobbered by Quick Facts.
    """

    out: dict[str, str] = {}
    for row in tree.css("div.sam-field-row"):
        label_node = row.css_first(".sam-field-label")
        value_node = row.css_first(".sam-field-value")
        if not label_node or not value_node:
            continue
        label = _strip_emoji(label_node.text(strip=True)).lower()
        if label:
            out.setdefault(label, value_node.text(strip=True))
    for li in tree.css(".sam-quick-facts li"):
        label_node = li.css_first(".sam-fact-label")
        value_node = li.css_first(".sam-fact-value")
        if not label_node or not value_node:
            continue
        label = _strip_emoji(label_node.text(strip=True)).lower()
        if label:
            out.setdefault(label, value_node.text(strip=True))
    return out


def _extract_story(tree: HTMLParser) -> tuple[str | None, dict[str, str]]:
    """Render every story section to readable plain text.

    Walks all `.sam-story-section` blocks in document order, converts each
    block's HTML to text (preserving paragraph and `<br>` boundaries), and
    peels any leading `Label: Value` lines off the first section into the
    returned `inline_fields` dict. When more than one section is present the
    section heading is included so the reader can tell them apart; with only
    one section the heading would just duplicate the page's "About <Name>" UI
    label, so we drop it.
    """

    rendered: list[tuple[str | None, str]] = []
    inline_fields: dict[str, str] = {}

    sections = tree.css("div.sam-story-section")
    if not sections:
        # Some pages drop the section wrapper and put content directly in
        # `.sam-story-content`. Fall back to that so we still surface text.
        for bare_content in tree.css(".sam-story-content"):
            text = _html_to_text(bare_content)
            if text:
                rendered.append((None, text))
    else:
        for index, section in enumerate(sections):
            section_content = section.css_first(".sam-story-content")
            if section_content is None:
                continue
            text = _html_to_text(section_content)
            if not text:
                continue
            if index == 0:
                text, inline_fields = _peel_inline_fields(text)
            if not text:
                continue
            heading_node = section.css_first("h2")
            heading = heading_node.text(strip=True) if heading_node else None
            rendered.append((heading, text))

    if not rendered:
        return None, inline_fields

    if len(rendered) == 1:
        return rendered[0][1], inline_fields

    parts: list[str] = []
    for heading, body in rendered:
        if heading and not re.match(r"(?i)^about\b", heading):
            parts.append(f"{heading}\n{body}")
        else:
            parts.append(body)
    return "\n\n".join(parts), inline_fields


def _html_to_text(node: Node) -> str:
    """Render an HTML node to readable plain text.

    `<br>` becomes a single newline and `</p>` becomes a paragraph break;
    other tags are stripped. HTML entities are decoded. Per-line whitespace
    runs collapse to a single space and consecutive blank lines collapse to
    one — selectolax's `.text(strip=True)` would have concatenated adjacent
    text nodes with no separator at all, producing the run-on
    `Name:MochiGender:Female...` we are fixing here.
    """

    raw = node.html or ""
    # SPCA's WordPress block editor emits `<br data-start="..." />` with attrs,
    # so we accept any attributes between the tag name and the closing bracket.
    raw = re.sub(r"(?is)<br\b[^>]*>", "\n", raw)
    raw = re.sub(r"(?is)</p\s*>", "\n\n", raw)
    raw = re.sub(r"<[^>]+>", "", raw)
    text = html_lib.unescape(raw)
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _normalize_inline_bullets(text)
    return text.strip()


def _normalize_inline_bullets(text: str) -> str:
    """Re-flow inline `•`-separated bullet runs as one item per line.

    Shelter staff often type 'Likes: • A • B • C' inline because the WordPress
    editor doesn't expose proper lists; the result reads as a wall of text on
    the detail page. We split every ` • ` onto its own line, and when a bullet
    line trails a `Heading:` label we lift that label onto its own line so the
    rendered list keeps its grouping.

    The heading split requires the next line to start with another bullet, so
    a stray colon mid-prose can't accidentally pull a non-heading apart. Only
    triggers when at least two bullets are present.
    """

    if text.count("•") < 2:
        return text
    text = re.sub(r"\s+•\s+", "\n• ", text)
    # Heading split: any '<bullet text> <Capitalised Heading>:' followed by a
    # new bullet line gets the heading lifted onto its own line. Lookahead on
    # the next bullet keeps non-heading colons (e.g. 'Loves: chicken') safe.
    text = re.sub(
        r"(• [^\n]*?)\s+([A-Z][A-Za-z /&'\-]{1,60}:)(?=\s*\n• )",
        r"\1\n\2",
        text,
    )
    return text


def _peel_inline_fields(text: str) -> tuple[str, dict[str, str]]:
    """Strip leading `Label: Value` lines off a description.

    The new SPCA layout inlines Name/Gender/Breed/Colour/Age into the
    description as a `<strong>Label:</strong> Value<br>` block before the
    narrative. After `_html_to_text` those become individual lines like
    `Gender: Female`. We extract them as fields so the structured Details
    panel can render them, and remove them from the body so the reader sees
    just the prose.

    Stops at the first non-matching line so a stray colon mid-narrative does
    not eat the rest of the description.
    """

    fields: dict[str, str] = {}
    lines = text.split("\n")
    consumed = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            consumed += 1
            continue
        match = re.match(r"^([A-Za-z][A-Za-z ]{0,30}):\s*(.+)$", stripped)
        if match is None:
            break
        label = match.group(1).strip().lower()
        if label not in _INLINE_FIELD_LABELS:
            break
        fields[label] = match.group(2).strip()
        consumed += 1
    remaining = "\n".join(lines[consumed:]).strip()
    return remaining, fields


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
