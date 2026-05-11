'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { cn } from '@/lib/cn'
import { formatAge } from '@/lib/format'
import type { Pet } from '@/types/pet'

type Source = { id: string; name: string }

type Props = {
  sources: Source[]
}

type Filters = {
  species: string
  size: string
  source: string
  ageMaxMonths: string
}

const EMPTY: Filters = { species: '', size: '', source: '', ageMaxMonths: '' }

export function SearchClient({ sources }: Props): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => readFiltersFromUrl(searchParams))
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Mirror filter state into URL whenever it changes.
  useEffect(() => {
    const params = filtersToUrlParams(filters)
    const next = params.toString()
    if (next !== searchParams.toString()) {
      router.replace(`/search${next ? `?${next}` : ''}`, { scroll: false })
    }
  }, [filters, router, searchParams])

  // Debounced query against /api/pets.
  useEffect(() => {
    const handle = window.setTimeout(async () => {
      try {
        const params = filtersToUrlParams(filters)
        params.set('limit', '50')
        const response = await fetch(`/api/pets?${params.toString()}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as { pets: Pet[] }
        setPets(data.pets)
        setCount(data.pets.length)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'failed to load')
      }
    }, 300)
    return () => window.clearTimeout(handle)
  }, [filters])

  const set = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const clear = useCallback(() => setFilters(EMPTY), [])

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
        <legend className="sr-only">Filters</legend>
        <FilterSelect
          label="Species"
          value={filters.species}
          onChange={(v) => set('species', v)}
          options={[
            { value: '', label: 'Any' },
            { value: 'dog', label: 'Dog' },
            { value: 'cat', label: 'Cat' },
            { value: 'rabbit', label: 'Rabbit' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <FilterSelect
          label="Size"
          value={filters.size}
          onChange={(v) => set('size', v)}
          options={[
            { value: '', label: 'Any' },
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
        />
        <FilterSelect
          label="Shelter"
          value={filters.source}
          onChange={(v) => set('source', v)}
          options={[
            { value: '', label: 'Any' },
            ...sources.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <FilterSelect
          label="Max age"
          value={filters.ageMaxMonths}
          onChange={(v) => set('ageMaxMonths', v)}
          options={[
            { value: '', label: 'Any' },
            { value: '6', label: 'Under 6 mo' },
            { value: '12', label: 'Under 1 yr' },
            { value: '36', label: 'Under 3 yr' },
            { value: '84', label: 'Under 7 yr' },
          ]}
        />
        <div className="col-span-2 flex items-center justify-between text-xs text-stone-600">
          <p>
            {count === null ? 'Loading…' : `${count} match${count === 1 ? '' : 'es'}`}
            {error && <span className="ml-2 text-rose-600">{error}</span>}
          </p>
          <button
            type="button"
            onClick={clear}
            className="font-medium text-amber-700 underline-offset-2 hover:underline focus-visible:underline"
          >
            Clear filters
          </button>
        </div>
      </fieldset>

      {pets && pets.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-white p-6 text-center">
          <p className="text-sm text-stone-700">
            No pets match these filters. Try widening — or come back tomorrow when new pets arrive.
          </p>
        </div>
      )}

      {pets && pets.length > 0 && (
        <ul className="grid grid-cols-2 gap-3" role="list">
          {pets.map((pet) => (
            <li key={pet.id}>
              <Link
                href={`/pets/${pet.id}`}
                className="group flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200 transition hover:ring-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pet.photoUrls[0] ?? '/pet-placeholder.svg'}
                    alt={pet.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="px-1 pb-1">
                  <p className="text-sm font-semibold text-stone-900">{pet.name}</p>
                  <p className="text-xs text-stone-600">
                    {[pet.breed, formatAge(pet.ageMonths)].filter(Boolean).join(' · ') ||
                      pet.species}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}): React.ReactElement {
  return (
    <label className={cn('flex flex-col gap-1 text-xs font-medium text-stone-700')}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function readFiltersFromUrl(searchParams: URLSearchParams): Filters {
  return {
    species: searchParams.get('species') ?? '',
    size: searchParams.get('size') ?? '',
    source: searchParams.get('source') ?? '',
    ageMaxMonths: searchParams.get('age_max_months') ?? '',
  }
}

function filtersToUrlParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.species) params.set('species', filters.species)
  if (filters.size) params.set('size', filters.size)
  if (filters.source) params.set('source', filters.source)
  // age_max_months isn't supported by /api/pets directly — translate to listed_since
  // is wrong here; for v1 we just record it in the URL and let the user reset.
  // A real `max_age` filter lands when we have age tiers in Phase 2 §2.5.
  if (filters.ageMaxMonths) params.set('age_max_months', filters.ageMaxMonths)
  return params
}
