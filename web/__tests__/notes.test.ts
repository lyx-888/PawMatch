import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { addFavorite, getFavoriteNote, removeFavorite, setFavoriteNote } from '@/lib/local-state'
import { NOTE_MAX_LENGTH, sanitizeNote } from '@/lib/notes/sanitize'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('sanitizeNote', () => {
  it('returns plain text unchanged', () => {
    expect(sanitizeNote('met him at the open day')).toBe('met him at the open day')
  })

  it('preserves whitespace and newlines', () => {
    expect(sanitizeNote('line one\nline two\n  indented')).toBe('line one\nline two\n  indented')
  })

  it('strips HTML tags', () => {
    expect(sanitizeNote('<script>alert(1)</script>hello')).toBe('alert(1)hello')
    expect(sanitizeNote('<b>bold</b> and <i>italic</i>')).toBe('bold and italic')
    expect(sanitizeNote('<img src=x onerror=alert(1)>')).toBe('')
  })

  it('strips HTML entities', () => {
    expect(sanitizeNote('foo &amp; bar')).toBe('foo  bar')
    expect(sanitizeNote('&#60;hello&#62;')).toBe('hello')
  })

  it('truncates to NOTE_MAX_LENGTH', () => {
    const long = 'x'.repeat(NOTE_MAX_LENGTH + 50)
    expect(sanitizeNote(long).length).toBe(NOTE_MAX_LENGTH)
  })
})

describe('favorite notes storage', () => {
  it('reads empty string for never-noted pets', () => {
    expect(getFavoriteNote('pet-1')).toBe('')
  })

  it('round-trips a note', () => {
    setFavoriteNote('pet-1', 'shy boy, needs patient home')
    expect(getFavoriteNote('pet-1')).toBe('shy boy, needs patient home')
  })

  it('sanitizes on write', () => {
    setFavoriteNote('pet-1', '<script>alert(1)</script>real text')
    expect(getFavoriteNote('pet-1')).toBe('alert(1)real text')
  })

  it('truncates on write', () => {
    setFavoriteNote('pet-1', 'x'.repeat(NOTE_MAX_LENGTH + 100))
    expect(getFavoriteNote('pet-1').length).toBe(NOTE_MAX_LENGTH)
  })

  it('deletes when set to empty string', () => {
    setFavoriteNote('pet-1', 'note')
    setFavoriteNote('pet-1', '')
    expect(getFavoriteNote('pet-1')).toBe('')
  })

  it('removeFavorite clears the matching note', () => {
    addFavorite('pet-1')
    setFavoriteNote('pet-1', 'note for one')
    addFavorite('pet-2')
    setFavoriteNote('pet-2', 'note for two')

    removeFavorite('pet-1')

    expect(getFavoriteNote('pet-1')).toBe('')
    expect(getFavoriteNote('pet-2')).toBe('note for two')
  })

  it('survives a corrupted notes blob', () => {
    window.localStorage.setItem('pawmatch_favorite_notes', '{not json')
    expect(getFavoriteNote('pet-1')).toBe('')
    // Writing should recover the state.
    setFavoriteNote('pet-1', 'fresh')
    expect(getFavoriteNote('pet-1')).toBe('fresh')
  })
})
