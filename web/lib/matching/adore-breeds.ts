// Project ADORE breed list — Singapore HDB's list of dog breeds permitted in
// flats regardless of the 10kg weight limit, plus Singapore Specials (local
// mixed-breeds) capped at 15kg. The canonical source is HDB's adoption
// scheme page; this file is the in-code mirror per requirements §2.3.1.g
// and is treated as the source of truth for matching.
//
// Whenever this list changes, the §2.3.6 recompute mechanism re-runs scoring
// for every HDB-housed user so their match tiers stay in sync.

// Singapore Special is a category (not a single breed) and is permitted up
// to 15kg under Project ADORE; export the cap separately so the housing-fit
// rule can apply it.
export const SINGAPORE_SPECIAL_WEIGHT_LIMIT_KG = 15

// Names normalised lower-case for matching. The matching engine lowercases
// the pet's `breed` field before comparison, so casing in shelter listings
// doesn't matter.
//
// Sourced from HDB's Project ADORE breed schedule. This is the v1-launch
// snapshot; the list is updated occasionally and admin can extend it here
// without code changes elsewhere.
export const ADORE_BREEDS: readonly string[] = [
  'singapore special',
  // Toy / small breeds explicitly listed under Project ADORE.
  'australian silky terrier',
  'australian terrier',
  'bichon frise',
  'bolognese',
  'border terrier',
  'boston terrier',
  'brussels griffon',
  'cairn terrier',
  'cavalier king charles spaniel',
  'chihuahua',
  'chinese crested',
  'coton de tulear',
  'czech terrier',
  'dachshund',
  'english toy spaniel',
  'french bulldog',
  'havanese',
  'italian greyhound',
  'jack russell terrier',
  'japanese chin',
  'japanese spitz',
  'lakeland terrier',
  'lhasa apso',
  'maltese',
  'manchester terrier',
  'miniature pinscher',
  'miniature poodle',
  'miniature schnauzer',
  'norfolk terrier',
  'norwich terrier',
  'papillon',
  'parson russell terrier',
  'pekingese',
  'pomeranian',
  'poodle (toy)',
  'pug',
  'schipperke',
  'scottish terrier',
  'sealyham terrier',
  'shetland sheepdog',
  'shiba inu',
  'shih tzu',
  'silky terrier',
  'skye terrier',
  'smooth fox terrier',
  'tibetan spaniel',
  'tibetan terrier',
  'toy poodle',
  'welsh terrier',
  'west highland white terrier',
  'wire fox terrier',
  'yorkshire terrier',
]

// Memoised lookup set so the housing-fit rule's check is O(1).
const ADORE_SET: Set<string> = new Set(ADORE_BREEDS)

/**
 * Is the given breed on the Project ADORE list (case-insensitive)?
 *
 * Unknown / null breeds return `false`. The housing-fit rule treats an
 * empty breed conservatively: an unspecified breed on an oversized dog
 * does NOT clear the HDB hard-fail. We only let through pets that are
 * (a) explicitly on the list, or (b) Singapore Specials within the 15kg
 * cap. The cap is checked by the caller because it needs the pet's weight.
 */
export function isAdoreBreed(breed: string | null | undefined): boolean {
  if (!breed) return false
  return ADORE_SET.has(breed.trim().toLowerCase())
}

/**
 * Singapore Specials get a higher weight ceiling than other breeds.
 * Returns true when the breed string contains "singapore special" — shelters
 * sometimes write it as "Singapore Special - mixed breed" or similar.
 */
export function isSingaporeSpecial(breed: string | null | undefined): boolean {
  if (!breed) return false
  return breed.trim().toLowerCase().includes('singapore special')
}
