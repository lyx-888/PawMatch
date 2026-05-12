import { describe, expect, it, vi } from 'vitest'

import { t, tPlural } from '@/lib/i18n'

describe('t()', () => {
  it('returns the literal English string for a known key', () => {
    expect(t('nav.search')).toBe('Search')
    expect(t('nav.favorites')).toBe('Favorites')
  })

  it('interpolates {name}-style params', () => {
    expect(t('pet_card.more_about', { name: 'Mei Mei' })).toBe('More about Mei Mei')
  })

  it('skips missing params silently (empty string)', () => {
    // header.last_updated expects {time}; not passing it should yield the
    // template minus the placeholder, not the literal "{time}".
    const out = t('header.last_updated', {})
    expect(out).not.toContain('{time}')
  })

  it('falls back to the key on a miss (and warns)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(t('this.is.not.real')).toBe('this.is.not.real')
    expect(warn).toHaveBeenCalledWith('[i18n] missing key: this.is.not.real')
    warn.mockRestore()
  })
})

describe('tPlural()', () => {
  it('picks the singular key for count===1', () => {
    expect(tPlural(1, 'search.match_one', 'search.match_other')).toBe('1 match')
  })

  it('picks the plural key for any other count', () => {
    expect(tPlural(0, 'search.match_one', 'search.match_other')).toBe('0 matches')
    expect(tPlural(5, 'search.match_one', 'search.match_other')).toBe('5 matches')
  })
})
