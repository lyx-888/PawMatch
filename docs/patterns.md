# Canonical Patterns

> Reference patterns to copy when building new features. Read on demand. The first feature implemented establishes the canon for what follows — these examples are the seed.

---

## API route handler pattern

```typescript
// web/app/api/pets/[id]/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getPetById } from '@/lib/db/pets'
import { errorResponse, jsonResponse } from '@/lib/api/responses'

const ParamsSchema = z.object({ id: z.string().uuid() })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) {
    return errorResponse(400, 'Invalid pet id')
  }

  const pet = await getPetById(parsed.data.id)
  if (!pet) {
    return errorResponse(404, 'Pet not found')
  }

  return jsonResponse(pet)
}
```

Rules embodied:
- Zod validates at the boundary.
- Errors use a shared helper for consistent shape.
- Logic lives in `lib/db/`, not in the route.
- Async params (Next.js 15+ pattern).

---

## Database access pattern

All DB access through `lib/db/` modules. One file per table or domain (e.g., `lib/db/pets.ts`, `lib/db/favorites.ts`). Functions return typed results, never raw query objects:

```typescript
// lib/db/pets.ts
import { createServerClient } from '@/lib/db/client'
import { DatabaseError } from '@/lib/db/errors'
import { mapRowToPet, type Pet } from '@/types/pet'

export async function getPetById(id: string): Promise<Pet | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new DatabaseError('getPetById', error)
  return data ? mapRowToPet(data) : null
}
```

Rules embodied:
- One function per query, named after the operation.
- Raw rows mapped to typed domain objects at the boundary.
- DB errors wrapped in a typed error for consistent handling upstream.

---

## Component pattern

Server Component by default; Client Component when needed for interaction.

**Server Component:**

```tsx
// components/pet/PetCard.tsx
import { type Pet } from '@/types/pet'
import { PetCardImage } from './PetCardImage'
import { PetCardFacts } from './PetCardFacts'

export function PetCard({ pet }: { pet: Pet }) {
  return (
    <article className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      <PetCardImage urls={pet.photo_urls} alt={pet.name} />
      <PetCardFacts pet={pet} />
    </article>
  )
}
```

**Client Component when needed:**

```tsx
// components/swipe/SwipeStack.tsx
'use client'

import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useState } from 'react'
// ...
```

Rules embodied:
- One component per file, file named after the component.
- Composition over prop drilling — break sub-components when one grows past ~50 lines.
- `"use client"` at the top, not buried.
- No `any` props. Always typed.

---

## Test pattern

Unit tests for `lib/`. Co-locate test files: `lib/matching/score.ts` ↔ `lib/matching/score.test.ts`.

```typescript
// lib/matching/score.test.ts
import { describe, expect, it } from 'vitest'
import { computeMatchScore } from './score'
import { hdbProfile, smallDog, largeDog } from './fixtures'

describe('computeMatchScore', () => {
  it('returns great for HDB user with small ADORE-eligible dog', () => {
    const result = computeMatchScore(hdbProfile, smallDog)
    expect(result.tier).toBe('great')
    expect(result.score).toBeGreaterThanOrEqual(75)
  })

  it('returns hard_fail for HDB user with 20kg dog not on ADORE list', () => {
    const result = computeMatchScore(hdbProfile, largeDog)
    expect(result.tier).toBe('hard_fail')
    expect(result.reasons).toContainEqual(
      expect.objectContaining({ template: 'housing_fit_fail' })
    )
  })
})
```

Rules embodied:
- Co-located tests.
- Fixtures imported from a shared module.
- Assertions on shape, not exact strings (which change with i18n).
- One behavior per test.

---

## Scraper pattern

```python
# scrapers/src/sources/spca.py
from scrapers.src.base import PetRecord, get_http_client
from selectolax.parser import HTMLParser

def scrape() -> list[PetRecord]:
    """Public entry point — does I/O, returns parsed records."""
    client = get_http_client()
    response = client.get("https://spca.org.sg/adoptions")
    response.raise_for_status()
    return _parse(response.text)

def _parse(html: str) -> list[PetRecord]:
    """Pure function — no I/O, easy to test against fixtures."""
    tree = HTMLParser(html)
    pets = []
    for card in tree.css("div.adoption-card"):
        # ... extraction logic ...
        pets.append(PetRecord(...))
    return pets
```

Rules embodied:
- Public `scrape()` does I/O.
- Private `_parse()` is pure — tests call this with fixture HTML.
- One scraper per file in `sources/`.
- All HTTP through the shared `base.get_http_client()`.

---

## Inngest job pattern

```typescript
// web/inngest/functions/match-score-recompute.ts
import { inngest } from '../client'

export const recomputeUserMatches = inngest.createFunction(
  {
    id: 'match-score-recompute-user',
    concurrency: { limit: 10 },
    retries: 3,
  },
  { event: 'match_score/recompute_user' },
  async ({ event, step }) => {
    const { user_id } = event.data

    const profile = await step.run('fetch-profile', () =>
      getProfileByUserId(user_id)
    )
    if (!profile) return { skipped: true, reason: 'no profile' }

    const pets = await step.run('fetch-pets', () => getAvailablePets())

    await step.run('recompute', async () => {
      const scores = pets.map(pet => computeMatchScore(profile, pet))
      await upsertMatchScores(user_id, scores)
    })

    return { user_id, count: pets.length }
  }
)
```

Rules embodied:
- `step.run` for each I/O boundary — Inngest checkpoints these for retry safety.
- Idempotent by design: rerunning produces the same end state.
- Concurrency limits where DB write contention matters.
- Return a small summary for observability.
