"""OSCAS (Oasis Second Chance Animal Shelter) scraper.

OSCAS publishes every adoptable dog on a single Squarespace page at
/adoption-gallery — there are no per-pet detail URLs. Each pet's block is a
sequence of sibling Squarespace blocks:

    1. an `html-block` whose content opens with `<h2>Name</h2>`, followed by a
       `<ul>` of facts (Gender, Born year, Sterilized status, HDB approved,
       Temperament) and `<p>` paragraphs of narrative;
    2. optionally a `button-block` with a `mailto:` interest link;
    3. optionally a `gallery-block` carousel of photos.

Pets are not consistently wrapped in their own container — the only reliable
boundary is `<h2>Name</h2>`. We chunk the HTML between successive `<h2>`
markers and treat each chunk as one pet, picking up whatever optional blocks
fall inside that chunk.

OSCAS rescues only dogs ("Singapore Specials"), so species is hardcoded.
Breed is not published per dog; the LLM extraction pass fills it in if it can.
"""

from __future__ import annotations

import html as html_lib
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime

from selectolax.parser import HTMLParser, Node

from base import PetRecord, Sex, get_http_client

logger = logging.getLogger(__name__)

GALLERY_URL = "https://www.oscas.sg/adoption-gallery"
SOURCE_ID = "oscas"

# An <h2> with this exact style attr is OSCAS's per-pet heading. Other
# headings on the page (section dividers, hero text) use different tags or
# class wrappings, so the style-attr match is specific enough to be safe.
_PET_H2_RE = re.compile(
    r'<h2 style="white-space:pre-wrap;">([^<]+)</h2>',
    re.IGNORECASE,
)

_SLUG_NONWORD_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class _Pet:
    name: str
    slug: str
    sex: Sex | None
    age_months: int | None
    hdb_approved: bool | None
    sterilized: bool | None
    temperament: str | None
    description: str | None
    photo_urls: list[str]


def scrape(*, today: datetime | None = None) -> list[PetRecord]:
    """Public entry point: fetches the gallery, returns one record per pet.

    `today` is injectable so tests can pin a date and assert age computation
    without depending on wall-clock time.
    """

    with get_http_client() as client:
        response = client.get(GALLERY_URL)
        response.raise_for_status()
        html = response.text

    return parse_gallery(html, today=today)


def parse_gallery(html: str, *, today: datetime | None = None) -> list[PetRecord]:
    """Pure parser: gallery HTML → list[PetRecord]."""

    now = today or datetime.now(UTC)
    pets: list[_Pet] = []
    seen_slugs: set[str] = set()

    for chunk in _split_by_pet(html):
        pet = _parse_pet_chunk(chunk, now=now)
        if pet is None:
            continue
        # Same shelter, same name twice on the page is rare but possible
        # (e.g. 'Paris (madamemoiselle)' vs 'Paris (monsieur)'). Slug collisions
        # would silently drop one — disambiguate with a counter so both get
        # written. The slugifier already keeps the parenthetical disambiguator.
        slug = pet.slug
        if slug in seen_slugs:
            suffix = 2
            while f"{slug}-{suffix}" in seen_slugs:
                suffix += 1
            slug = f"{slug}-{suffix}"
            pet = _replace_slug(pet, slug)
        seen_slugs.add(slug)
        pets.append(pet)

    return [_record_from_pet(p) for p in pets]


def _split_by_pet(html: str) -> list[str]:
    """Yield the HTML slice belonging to each pet on the page.

    The page is one long sequence of sibling Squarespace blocks; pet
    boundaries are the per-pet `<h2>` tags. We split the raw string at each
    match and pair the heading with the markup that follows up to the next
    heading. Anything before the first match is unrelated chrome.
    """

    matches = list(_PET_H2_RE.finditer(html))
    if not matches:
        return []
    chunks: list[str] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(html)
        chunks.append(html[start:end])
    return chunks


def _parse_pet_chunk(chunk: str, *, now: datetime) -> _Pet | None:
    """Parse one pet's slice of the gallery HTML."""

    tree = HTMLParser(chunk)
    h2 = tree.css_first("h2")
    if h2 is None:
        return None
    name = h2.text(strip=True)
    if not name:
        return None

    bullets = _extract_bullets(tree)
    sex = _parse_sex(_find(bullets, _SEX_BULLET_RE))
    born_year = _parse_year(_find(bullets, _BORN_BULLET_RE))
    age_months = _age_months_from_year(born_year, now=now)
    hdb_approved = _parse_hdb(_find(bullets, _HDB_BULLET_RE))
    sterilized = _parse_sterilized(_find(bullets, _STERILIZED_BULLET_RE))
    temperament = _parse_temperament(_find(bullets, _TEMPERAMENT_BULLET_RE))

    description = _extract_description(tree)
    photo_urls = _extract_photos(tree)

    return _Pet(
        name=name,
        slug=_slugify(name),
        sex=sex,
        age_months=age_months,
        hdb_approved=hdb_approved,
        sterilized=sterilized,
        temperament=temperament,
        description=description,
        photo_urls=photo_urls,
    )


def _record_from_pet(pet: _Pet) -> PetRecord:
    """Translate the intermediate `_Pet` into the canonical PetRecord.

    Sterilized status and temperament become tags so they reach the matching
    engine through the existing `tags` array — the schema doesn't have
    dedicated columns for either yet.
    """

    tags: list[str] = []
    if pet.sterilized is True:
        tags.append("sterilized")
    elif pet.sterilized is False:
        tags.append("not sterilized")
    if pet.temperament:
        tags.append(pet.temperament)

    return PetRecord(
        source=SOURCE_ID,
        source_id=pet.slug,
        # No detail URL exists; the gallery is the canonical page. Visitors
        # land there and scroll to find their pet — same as the shelter's
        # own UX.
        source_url=GALLERY_URL,  # type: ignore[arg-type]
        name=pet.name,
        species="dog",
        sex=pet.sex,
        age_months=pet.age_months,
        hdb_approved=pet.hdb_approved,
        description=pet.description,
        tags=tags,
        photo_urls=pet.photo_urls,  # type: ignore[arg-type]
    )


# --- Bullet-list parsing ---------------------------------------------------

# Bullet text patterns. Each is anchored loosely so leading bullets/whitespace
# don't matter; we match the substring that identifies the field.

_SEX_BULLET_RE = re.compile(r"^\s*(?P<value>male|female)\b", re.IGNORECASE)
_BORN_BULLET_RE = re.compile(r"\bborn\b", re.IGNORECASE)
_HDB_BULLET_RE = re.compile(r"\bhdb\b.*\bapproved\b", re.IGNORECASE)
_STERILIZED_BULLET_RE = re.compile(r"\bsterili[sz]ed\b", re.IGNORECASE)
_TEMPERAMENT_BULLET_RE = re.compile(r"\btemperament\s*:\s*", re.IGNORECASE)


def _extract_bullets(tree: HTMLParser) -> list[str]:
    """Pull every `<li>` text inside the pet's html-block.

    Each bullet in OSCAS' Squarespace markup is `<li><p>Text</p></li>`, and
    sometimes wraps fragments in `<strong>` (e.g. `<strong>Not</strong> HDB
    Approved`). Selectolax's `text(strip=True)` concatenates adjacent text
    nodes without a separator, producing `NotHDB Approved` and breaking our
    HDB regex. Render via `_html_to_text` instead so the inter-tag space
    survives.
    """

    bullets: list[str] = []
    for li in tree.css("li"):
        text = _html_to_text(li)
        if text:
            bullets.append(text)
    return bullets


def _find(bullets: list[str], pattern: re.Pattern[str]) -> str | None:
    """Return the first bullet matching the pattern, or None."""

    for b in bullets:
        if pattern.search(b):
            return b
    return None


def _parse_sex(raw: str | None) -> Sex | None:
    if not raw:
        return None
    m = _SEX_BULLET_RE.match(raw)
    if not m:
        return None
    return m.group("value").lower()  # type: ignore[return-value]


def _parse_year(raw: str | None) -> int | None:
    """Extract a four-digit year out of a 'Born in YYYY (estimate)' bullet."""

    if not raw:
        return None
    match = re.search(r"(?<!\d)(\d{4})(?!\d)", raw)
    if not match:
        return None
    year = int(match.group(1))
    # Sanity: must be a plausible dog-lifetime year.
    if year < 1990 or year > datetime.now(UTC).year:
        return None
    return year


def _age_months_from_year(year: int | None, *, now: datetime) -> int | None:
    """Convert birth year to age in months.

    OSCAS only gives the year, so we assume mid-year (July) as the birth
    month and compute from `now`. Anything that rounds down to zero is
    reported as None so the UI doesn't claim a brand-new puppy when we just
    don't have the data.
    """

    if year is None:
        return None
    assumed_birth = datetime(year, 7, 1, tzinfo=UTC)
    delta_days = (now - assumed_birth).days
    months = round(delta_days / 30.4375)
    return months if months > 0 else None


def _parse_hdb(raw: str | None) -> bool | None:
    """'HDB Approved' → True, 'Not HDB Approved' → False."""

    if not raw:
        return None
    lower = raw.lower()
    if not re.search(r"hdb\s+approved", lower):
        return None
    # 'Not HDB Approved' / 'NOT HDB Approved' → False; bare 'HDB Approved' → True.
    return not re.search(r"\bnot\b", lower)


def _parse_sterilized(raw: str | None) -> bool | None:
    if not raw:
        return None
    lower = raw.lower()
    if not re.search(r"sterili[sz]ed", lower):
        return None
    return not re.search(r"\bnot\b", lower)


def _parse_temperament(raw: str | None) -> str | None:
    """Return the value after 'Temperament:' as a clean tag string."""

    if not raw:
        return None
    match = _TEMPERAMENT_BULLET_RE.search(raw)
    if not match:
        return None
    value = raw[match.end():].strip()
    return value or None


# --- Description + photos --------------------------------------------------


def _extract_description(tree: HTMLParser) -> str | None:
    """Concatenate the narrative `<p>` paragraphs inside the pet's chunk.

    OSCAS' description paragraphs always carry `style="white-space:pre-wrap;"`
    — the same signature Squarespace's text editor emits — so we use that as
    the selector. The `.sqs-html-content` wrapper opens *before* the per-pet
    `<h2>` and is therefore outside the chunk we're given, so we can't rely
    on a parent-class scope; the style selector replaces it.

    Paragraphs inside the bullet list are skipped so bullets don't bleed
    into the description, and paragraphs inside button or gallery blocks
    further down the chunk are skipped on the same rule (those don't carry
    the pre-wrap style attribute).
    """

    paragraphs: list[str] = []
    for p in tree.css("p[style*='white-space:pre-wrap']"):
        if _has_ancestor(p, "li"):
            continue
        text = _html_to_text(p)
        if text:
            paragraphs.append(text)
    if not paragraphs:
        return None
    return "\n\n".join(paragraphs)


def _has_ancestor(node: Node, tag: str) -> bool:
    parent = node.parent
    while parent is not None:
        if parent.tag == tag:
            return True
        parent = parent.parent
    return False


def _extract_photos(tree: HTMLParser) -> list[str]:
    """Pull every Squarespace gallery image inside the pet's chunk.

    Squarespace renders the carousel as `img.thumb-image` slides with the
    canonical URL on `data-src` / `data-image`. The `<noscript>` fallback
    images carry the same URL on `src`; we prefer the data attribute since
    it's the one the live page uses.
    """

    urls: list[str] = []
    seen: set[str] = set()

    for img in tree.css("img.thumb-image"):
        candidate = (
            img.attributes.get("data-image")
            or img.attributes.get("data-src")
            or img.attributes.get("src")
        )
        if not candidate:
            continue
        candidate = candidate.strip()
        if candidate in seen:
            continue
        seen.add(candidate)
        urls.append(candidate)
    return urls


def _html_to_text(node: Node) -> str:
    """Render a node's HTML to readable plain text with paragraph breaks."""

    raw = node.html or ""
    raw = re.sub(r"(?is)<br\b[^>]*>", "\n", raw)
    raw = re.sub(r"(?is)</p\s*>", "\n\n", raw)
    raw = re.sub(r"<[^>]+>", "", raw)
    text = html_lib.unescape(raw)
    lines = [re.sub(r"[ \t \xa0]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _slugify(name: str) -> str:
    """Name → stable kebab-case slug usable as source_id.

    Collapses whitespace and punctuation, keeps a parenthetical disambiguator
    by treating ' ', '(' and ')' the same way as other non-word characters.
    'Paris (madamemoiselle)' → 'paris-madamemoiselle'.
    """

    lower = name.lower().strip()
    cleaned = _SLUG_NONWORD_RE.sub("-", lower)
    return cleaned.strip("-")


def _replace_slug(pet: _Pet, slug: str) -> _Pet:
    """Return a copy of `pet` with a new slug. Frozen dataclass safe."""

    return _Pet(
        name=pet.name,
        slug=slug,
        sex=pet.sex,
        age_months=pet.age_months,
        hdb_approved=pet.hdb_approved,
        sterilized=pet.sterilized,
        temperament=pet.temperament,
        description=pet.description,
        photo_urls=pet.photo_urls,
    )
