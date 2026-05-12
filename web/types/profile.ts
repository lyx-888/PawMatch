import { z } from 'zod'

// Enums kept in sync with the check constraints on the `profiles` table.
// When a value is added here, add it to the migration too; PostgREST will
// reject anything else.

export const HOUSING_TYPES = ['hdb', 'condo', 'landed', 'other'] as const
export const MESH_STATUSES = ['meshed', 'not_meshed', 'planning'] as const
export const OTHER_PETS = ['none', 'cats', 'dogs', 'both'] as const
export const WORK_PATTERNS = ['wfh', 'hybrid', 'office', 'shift', 'other'] as const
export const EXPERIENCE_LEVELS = ['first_time', 'some', 'experienced'] as const
export const ACTIVITY_LEVELS = ['sedentary', 'moderate', 'very_active'] as const
export const BUDGET_TIERS = ['low', 'medium', 'high'] as const
export const SPECIES_PREFS = ['dog', 'cat', 'rabbit', 'other'] as const

// PATCH body. Every field optional and nullable so partial updates work —
// the client sends only the keys it's changing, and `null` explicitly clears
// a field. `completion_pct` and `updated_at` are server-managed (set by the
// trigger) and can never be passed in.
//
// `strict()` rejects unknown keys so a typo in the client never silently
// no-ops; combined with the underlying RLS, this is the safety net.
export const ProfilePatchSchema = z
  .object({
    housing_type: z.enum(HOUSING_TYPES).nullable().optional(),
    hdb_block_type: z.string().min(1).max(120).nullable().optional(),
    mesh_status: z.enum(MESH_STATUSES).nullable().optional(),
    has_kids: z.boolean().nullable().optional(),
    kid_ages: z.array(z.number().int().min(0).max(25)).max(10).optional(),
    other_pets: z.enum(OTHER_PETS).nullable().optional(),
    work_pattern: z.enum(WORK_PATTERNS).nullable().optional(),
    hours_alone: z.number().int().min(0).max(24).nullable().optional(),
    experience: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
    activity_level: z.enum(ACTIVITY_LEVELS).nullable().optional(),
    budget_tier: z.enum(BUDGET_TIERS).nullable().optional(),
    special_needs_ok: z.boolean().nullable().optional(),
    species_pref: z.array(z.enum(SPECIES_PREFS)).max(4).optional(),
  })
  .strict()
  .refine(
    // Belt-and-braces version of the SQL CHECK on the table: kid_ages must
    // be empty unless has_kids is true. The DB will reject too, but
    // returning a friendly 400 here saves a round trip.
    (val) => {
      if (val.has_kids === true) return true
      if (val.kid_ages === undefined) return true
      return val.kid_ages.length === 0
    },
    { message: 'kid_ages can only be set when has_kids is true.', path: ['kid_ages'] },
  )

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>

// The full row shape as returned by GET. Mirrors the `profiles` table
// exactly. Optional everywhere because the row starts entirely null.
export type Profile = {
  user_id: string
  housing_type: (typeof HOUSING_TYPES)[number] | null
  hdb_block_type: string | null
  mesh_status: (typeof MESH_STATUSES)[number] | null
  has_kids: boolean | null
  kid_ages: number[]
  other_pets: (typeof OTHER_PETS)[number] | null
  work_pattern: (typeof WORK_PATTERNS)[number] | null
  hours_alone: number | null
  experience: (typeof EXPERIENCE_LEVELS)[number] | null
  activity_level: (typeof ACTIVITY_LEVELS)[number] | null
  budget_tier: (typeof BUDGET_TIERS)[number] | null
  special_needs_ok: boolean | null
  species_pref: (typeof SPECIES_PREFS)[number][]
  completion_pct: number
  updated_at: string
}
