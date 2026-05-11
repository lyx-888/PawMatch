import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  FAVORITES_CAP,
  PASSES_CAP,
  addFavorite,
  addPass,
  getExcludeIds,
  getFavorites,
  getPasses,
  removeFavorite,
} from '@/lib/local-state'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('addFavorite', () => {
  it('adds an id once', () => {
    expect(addFavorite('a')).toBe('added')
    expect(getFavorites()).toEqual(['a'])
  })

  it('is idempotent', () => {
    addFavorite('a')
    expect(addFavorite('a')).toBe('already-present')
    expect(getFavorites()).toEqual(['a'])
  })

  it('caps at FAVORITES_CAP', () => {
    for (let i = 0; i < FAVORITES_CAP; i += 1) addFavorite(`pet-${i}`)
    expect(getFavorites()).toHaveLength(FAVORITES_CAP)
    expect(addFavorite('overflow')).toBe('cap-reached')
    expect(getFavorites()).toHaveLength(FAVORITES_CAP)
  })
})

describe('removeFavorite', () => {
  it('removes a present id', () => {
    addFavorite('a')
    addFavorite('b')
    removeFavorite('a')
    expect(getFavorites()).toEqual(['b'])
  })

  it('is a no-op for missing ids', () => {
    addFavorite('a')
    removeFavorite('missing')
    expect(getFavorites()).toEqual(['a'])
  })
})

describe('addPass', () => {
  it('adds and dedupes', () => {
    expect(addPass('a')).toBe('added')
    expect(addPass('a')).toBe('already-present')
    expect(getPasses()).toEqual(['a'])
  })

  it('evicts oldest when at cap (FIFO)', () => {
    for (let i = 0; i < PASSES_CAP; i += 1) addPass(`pet-${i}`)
    const result = addPass('newest')
    expect(result).toBe('evicted-oldest')
    const passes = getPasses()
    expect(passes).toHaveLength(PASSES_CAP)
    expect(passes[0]).toBe('pet-1') // pet-0 evicted
    expect(passes[passes.length - 1]).toBe('newest')
  })
})

describe('getExcludeIds', () => {
  it('merges favorites and passes', () => {
    addFavorite('a')
    addPass('b')
    expect(new Set(getExcludeIds())).toEqual(new Set(['a', 'b']))
  })
})
