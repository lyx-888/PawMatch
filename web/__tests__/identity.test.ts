import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ANONYMOUS_ID_KEY, getAnonymousId } from '@/lib/identity'

describe('getAnonymousId', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('mints a UUID on first call', () => {
    const id = getAnonymousId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('persists the same id across calls', () => {
    const first = getAnonymousId()
    const second = getAnonymousId()
    expect(first).toBe(second)
  })

  it('stores under the documented key', () => {
    getAnonymousId()
    const stored = window.localStorage.getItem(ANONYMOUS_ID_KEY)
    expect(stored).not.toBeNull()
  })
})
