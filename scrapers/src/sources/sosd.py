"""Save Our Street Dogs (SOSD) scraper.

SOSD's site is WordPress + Elementor. Every adoptable dog appears on a single
listing at /adopt-a-dog/ — no pagination — and each card links to a detail page
at /<slug>/. Cards expose name, photo, gender, HDB-approved, and age. Detail
pages add the description (a `Personality:` heading followed by paragraphs),
an Estimated DOB, a Categories list we lift as tags, and a photo gallery.

SOSD lists only dogs (Singapore Specials / mongrels), so species is hardcoded.
Breed is not published per-dog; we leave it None and let the LLM extraction
pass (Phase 2.2) infer it from the description if it can.
"""

from __future__ import annotations

import html as html_lib
import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx
from selectolax.parser import HTMLParser, Node

from base import PetRecord, Sex, get_http_client

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://www.sosd.org.sg/adopt-a-dog/"
SOURCE_ID = "sosd"

_DOG_DETAIL_SLUG_RE = re.compile(r"^/([a-z0-9][a-z0-9\-]*)/?$", re.IGNORECASE)

# Strip WordPress' generated `-WxH` thumbnail suffix so we store the original
# upload URL. `foo-300x202.jpg` → `foo.jpg`.
_WP_SIZE_SUFFIX_RE = re.compile(r"-\d+x\d+(?=\.(?:jpe?g|png|webp|gif)$)", re.IGNORECASE)


def _wp_strip_size(url: str) -> str:
    return _WP_SIZE_SUFFIX_RE.sub("", url)

# Paths we know are not dog pages, even if they sometimes appear inside the
# loop container due to layout choices. Belt-and-braces against grabbing a
# stray nav link as a "dog".
_NON_DOG_SLUGS: frozenset[str] = frozenset(
    {
        "adopt-a-dog",
        "adopt",
        "donate",
        "volunteer",
        "contact-us",
        "about-us",
        "our-story",
        "sponsor",
        "sponsor-a-dog",
        "adopter-sign-up-form",
        "foster",
        "events",
        "shop",
        "blog",
        "media",
    }
)


@dataclass(frozen=True)
class _Card:
    slug: str
    name: str
    photo_url: str
    source_url: str
    sex: Sex | None
    hdb_approved: bool | None
    age_months: int | None


@dataclass(frozen=True)
class _Detail:
    name: str
    sex: Sex | None
    age_months: int | None
    hdb_approved: bool | None
    description: str | None
    tags: list[str]
    photo_urls: list[str]


def scrape() -> list[PetRecord]:
    """Public entry point: fetches the listing, then each dog's detail page.

    Returns one PetRecord per adoptable dog. Detail-page failures are isolated
    per pet so one bad page does not abort the whole scrape.
    """

    records: list[PetRecord] = []
    seen_slugs: set[str] = set()

    with get_http_client() as client:
        response = client.get(ARCHIVE_URL)
        response.raise_for_status()
        cards = _parse_archive(response.text)

        for card in cards:
            if card.slug in seen_slugs:
                continue
            seen_slugs.add(card.slug)

            detail = _fetch_detail(client, card.source_url)
            if detail is None:
                # Detail fetch failed; fall back to the card-only record so the
                # dog still appears in the app with at least name + photo.
                records.append(_record_from_card(card))
                continue
            records.append(_merge(card, detail))
    return records


def _fetch_detail(client: httpx.Client, url: str) -> _Detail | None:
    try:
        response = client.get(url)
        response.raise_for_status()
    except httpx.HTTPError:
        logger.exception("sosd detail fetch failed: %s", url)
        return None
    return _parse_detail(response.text)


def _parse_archive(html: str) -> list[_Card]:
    """Pure parser — extracts every dog card on the single archive page.

    SOSD's listing has two card layouts that coexist on the same page:

    * The featured/sponsorship band at the top renders Elementor loop items
      (`div.e-loop-item`), one per dog with a sponsor CTA.
    * The main grid below renders a custom WordPress template,
      `a.dog-loop-inner`, which is just an `<a>` wrapping an image, a `<ul>`
      of facts, and an `<h4 class="name">` heading.

    We parse both and dedupe on slug so a dog featured in the sponsor band
    isn't double-counted with their entry in the main grid.
    """

    tree = HTMLParser(html)
    cards: list[_Card] = []
    seen: set[str] = set()

    for item in tree.css("div.e-loop-item"):
        card = _parse_elementor_card(item)
        if card is None or card.slug in seen:
            continue
        seen.add(card.slug)
        cards.append(card)

    for anchor in tree.css("a.dog-loop-inner"):
        card = _parse_simple_card(anchor)
        if card is None or card.slug in seen:
            continue
        seen.add(card.slug)
        cards.append(card)

    return cards


def _parse_elementor_card(item: Node) -> _Card | None:
    """Parse a single Elementor-rendered card from the sponsor band."""

    link = _first_dog_link(item)
    if link is None:
        return None
    source_url = link.attributes.get("href")
    if not source_url:
        return None
    source_url = urljoin(ARCHIVE_URL, source_url)
    slug = _slug_from_url(source_url)
    if not slug:
        return None

    img = item.css_first(".elementor-widget-theme-post-featured-image img")
    if img is None:
        img = item.css_first("img")
    photo_url = img.attributes.get("src") if img else None
    if not photo_url:
        return None
    photo_url = urljoin(source_url, photo_url)

    name_node = item.css_first("h4.elementor-heading-title")
    name = name_node.text(strip=True) if name_node else None
    if not name and img is not None:
        name = (img.attributes.get("alt") or "").strip()
    if not name:
        return None

    sex, hdb, age = _parse_card_info_list(item)
    return _Card(
        slug=slug,
        name=name,
        photo_url=photo_url,
        source_url=source_url,
        sex=sex,
        hdb_approved=hdb,
        age_months=age,
    )


def _parse_simple_card(anchor: Node) -> _Card | None:
    """Parse one card from the main `a.dog-loop-inner` grid.

    Markup is straightforward: the anchor's href is the detail URL, the
    inner img is the photo, the `ul > li` items are Gender / HDB / Age, and
    the `<h4 class="name">` carries the dog's name.
    """

    source_url = anchor.attributes.get("href")
    if not source_url:
        return None
    source_url = urljoin(ARCHIVE_URL, source_url)
    slug = _slug_from_url(source_url)
    if not slug:
        return None

    img = anchor.css_first("img")
    photo_url = img.attributes.get("src") if img else None
    if not photo_url:
        return None
    photo_url = urljoin(source_url, photo_url)
    # The simple template's `src` is the medium thumbnail; the srcset carries
    # the original. Stripping WordPress' `-WxH` suffix gives the original URL,
    # avoiding low-resolution images on the swipe card.
    photo_url = _wp_strip_size(photo_url)

    name_node = anchor.css_first("h4.name")
    name = name_node.text(strip=True) if name_node else None
    if not name and img is not None:
        name = (img.attributes.get("alt") or "").strip()
    if not name:
        return None

    sex, hdb, age = _parse_simple_card_info(anchor)
    return _Card(
        slug=slug,
        name=name,
        photo_url=photo_url,
        source_url=source_url,
        sex=sex,
        hdb_approved=hdb,
        age_months=age,
    )


def _parse_simple_card_info(anchor: Node) -> tuple[Sex | None, bool | None, int | None]:
    """Pull Gender / HDB / Age from the plain `<li>` list inside the card.

    The simple template puts each fact in its own `<li>` with an icon SVG
    and the value as text. We match by value shape — same heuristic as the
    Elementor card — so the parser does not depend on the SVG icons.
    """

    sex: Sex | None = None
    hdb: bool | None = None
    age: int | None = None
    for li in anchor.css("li"):
        text = li.text(strip=True)
        if not text:
            continue
        lower = text.lower()
        if lower in {"male", "female"}:
            sex = lower  # type: ignore[assignment]
        elif lower.startswith("hdb:"):
            hdb = _parse_yes_no(lower.split(":", 1)[1])
        elif age is None and re.match(r"^\d", text):
            age = _parse_age_months(text)
    return sex, hdb, age


def _first_dog_link(item: Node) -> Node | None:
    """First anchor inside the card that points to a dog detail page.

    Skips nav / utility links (e.g. the duplicated 'Donate' anchor that the
    loop template renders inside each item on some pages).
    """

    for anchor in item.css("a"):
        href = anchor.attributes.get("href")
        if not href:
            continue
        slug = _slug_from_url(href)
        if slug:
            return anchor
    return None


def _parse_card_info_list(item: Node) -> tuple[Sex | None, bool | None, int | None]:
    """Pull Gender / HDB / Age out of the icon-list `<li>` items.

    The list always has the three fields in the same order on SOSD's template,
    but the icon SVG between label and value differs per row. Rather than
    relying on the SVG class we just match by the value's textual shape:
    Male/Female for sex, 'HDB: Yes/No' for HDB, and the only field with a
    numeric prefix for age.
    """

    sex: Sex | None = None
    hdb: bool | None = None
    age: int | None = None
    for span in item.css(".elementor-icon-list-text"):
        text = span.text(strip=True)
        if not text:
            continue
        lower = text.lower()
        if lower in {"male", "female"}:
            sex = lower  # type: ignore[assignment]
        elif lower.startswith("hdb:"):
            hdb = _parse_yes_no(lower.split(":", 1)[1])
        elif age is None and re.match(r"^\d", text):
            age = _parse_age_months(text)
    return sex, hdb, age


def _parse_detail(html: str) -> _Detail | None:
    """Pure parser for a single dog detail page."""

    tree = HTMLParser(html)
    title_node = tree.css_first("h1.elementor-heading-title")
    if title_node is None:
        return None
    name = title_node.text(strip=True)
    if not name:
        return None

    fields = _extract_labelled_fields(tree)
    sex = _parse_sex(fields.get("gender"))
    age_months = _parse_age_months(fields.get("age"))
    hdb_approved = _parse_yes_no(fields.get("hdb approved"))
    tags = _parse_categories(fields.get("categories"))

    description = _extract_personality(tree)
    photo_urls = _collect_photos(tree)

    return _Detail(
        name=name,
        sex=sex,
        age_months=age_months,
        hdb_approved=hdb_approved,
        description=description,
        tags=tags,
        photo_urls=photo_urls,
    )


def _extract_labelled_fields(tree: HTMLParser) -> dict[str, str]:
    """Collect `<b>Label:</b> Value` rows into a lowercase-keyed dict.

    SOSD inlines its structured fields inside `.elementor-icon-list-text`
    spans whose inner HTML is `<b>Label: </b>Value`. The label-only entries
    such as 'Child Friendly:' (followed by separate visual indicators in the
    next block) are ignored — we only keep entries that carry a real value.
    """

    out: dict[str, str] = {}
    for span in tree.css(".elementor-icon-list-text"):
        bold = span.css_first("b")
        if bold is None:
            continue
        label = bold.text(strip=True).rstrip(":").strip().lower()
        if not label:
            continue
        full_text = span.text(strip=True)
        bold_text = bold.text(strip=True)
        # Value is the part of the span text following the bold label. Most
        # values come immediately after the colon, but stray whitespace is
        # the rule on this site so we strip it.
        value = full_text[len(bold_text):].lstrip(": ").strip()
        if value:
            out.setdefault(label, value)
    return out


def _extract_personality(tree: HTMLParser) -> str | None:
    """Return the dog's narrative description as readable plain text.

    The description lives in the `theme-post-content` widget directly after
    the 'Personality:' heading. We render its inner HTML to text (paragraphs
    preserved, `<br>` as newlines) so the detail page can display real
    paragraph breaks.
    """

    content_node = tree.css_first(
        ".elementor-widget-theme-post-content .elementor-widget-container"
    )
    if content_node is None:
        return None
    return _html_to_text(content_node) or None


def _collect_photos(tree: HTMLParser) -> list[str]:
    """Pull every gallery image, deduped, in document order.

    SOSD's gallery is rendered by the PowerPack image-slider widget as
    `img.pp-image-slider-image`. We ignore the thumbnail strip — the main
    slides are the canonical full-resolution copies.
    """

    urls: list[str] = []
    seen: set[str] = set()
    for img in tree.css("img.pp-image-slider-image"):
        src = img.attributes.get("src")
        if not src:
            continue
        src = src.strip()
        if src in seen:
            continue
        seen.add(src)
        urls.append(src)
    return urls


def _record_from_card(card: _Card) -> PetRecord:
    """Build a PetRecord from card-only data when the detail fetch failed.

    Better to show the dog with thin data than to drop them entirely — a
    visitor can still click through to the live SOSD page for the rest.
    """

    return PetRecord(
        source=SOURCE_ID,
        source_id=card.slug,
        source_url=card.source_url,  # type: ignore[arg-type]
        name=card.name,
        species="dog",
        sex=card.sex,
        age_months=card.age_months,
        hdb_approved=card.hdb_approved,
        photo_urls=[card.photo_url],  # type: ignore[list-item]
    )


def _merge(card: _Card, detail: _Detail) -> PetRecord:
    """Combine card metadata with the richer detail-page fields.

    Detail fields win where both sources have them — the detail page is more
    detailed (e.g. age might be 'unknown' on the card but specific on detail).
    Photos come from the detail gallery, falling back to the card thumbnail.
    """

    photos = detail.photo_urls or [card.photo_url]
    return PetRecord(
        source=SOURCE_ID,
        source_id=card.slug,
        source_url=card.source_url,  # type: ignore[arg-type]
        name=detail.name or card.name,
        species="dog",
        sex=detail.sex or card.sex,
        age_months=detail.age_months or card.age_months,
        hdb_approved=detail.hdb_approved if detail.hdb_approved is not None else card.hdb_approved,
        description=detail.description,
        tags=detail.tags,
        photo_urls=photos,  # type: ignore[arg-type]
    )


def _html_to_text(node: Node) -> str:
    """Render a node's HTML to readable plain text with paragraph breaks."""

    raw = node.html or ""
    raw = re.sub(r"(?is)<br\b[^>]*>", "\n", raw)
    raw = re.sub(r"(?is)</p\s*>", "\n\n", raw)
    raw = re.sub(r"<[^>]+>", "", raw)
    text = html_lib.unescape(raw)
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _parse_categories(raw: str | None) -> list[str]:
    """Comma-separated categories → list of trimmed tags.

    SOSD uses 'Senior, Shy & Skittish, Low Energy, Dog with Medical Needs' as
    a freeform string; we split on commas and discard empties. Casing is
    preserved because the UI shows these verbatim.
    """

    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _parse_yes_no(raw: str | None) -> bool | None:
    if not raw:
        return None
    lower = raw.strip().lower()
    if lower in {"yes", "y", "true"}:
        return True
    if lower in {"no", "n", "false"}:
        return False
    return None


def _parse_sex(raw: str | None) -> Sex | None:
    if not raw:
        return None
    lower = raw.strip().lower()
    if lower.startswith("m"):
        return "male"
    if lower.startswith("f"):
        return "female"
    return None


def _parse_age_months(raw: str | None) -> int | None:
    """Parse SOSD age strings: '10.5 years old', '4 months', '1 year 3 months'.

    Returns None if the input doesn't contain a number we can read. Handles
    decimal years (common on SOSD: '10.5 years old' → 126 months) by treating
    fractional years as 12-month increments.
    """

    if not raw:
        return None
    lower = raw.lower()
    years_match = re.search(r"(\d+(?:\.\d+)?)\s*y(?:ea)?r?s?", lower)
    months_match = re.search(r"(\d+)\s*m(?:onth)?s?", lower)
    if not years_match and not months_match:
        return None
    years = float(years_match.group(1)) if years_match else 0.0
    months = int(months_match.group(1)) if months_match else 0
    total = round(years * 12) + months
    return total if total > 0 else None


def _slug_from_url(url: str) -> str:
    """Extract the dog slug from a SOSD URL, or '' if it isn't a dog URL.

    Accepts absolute URLs and root-relative paths. Filters out non-dog paths
    (e.g. `/adopt/`, `/donate/`) by exact match against the known set above.
    """

    try:
        path = urlparse(url).path or url
    except ValueError:
        return ""
    match = _DOG_DETAIL_SLUG_RE.match(path)
    if match is None:
        return ""
    slug = match.group(1).lower()
    if slug in _NON_DOG_SLUGS:
        return ""
    return slug
