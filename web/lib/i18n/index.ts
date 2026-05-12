import en from './en.json'

// i18n primitive per task 2.12. v1 ships English only; the layer exists so
// v2 can drop in a locale file (or load by request) without touching every
// component.
//
// Lookup is by dot-path; missing keys return the key itself so a typo is
// visible in dev. Interpolation uses `{name}` placeholders.

type LocaleDict = Record<string, unknown>

const dict = en as LocaleDict

function resolve(path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = dict
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return cur
}

export function t(key: string, params?: Record<string, string | number>): string {
  const raw = resolve(key)
  if (typeof raw !== 'string') {
    if (process.env.NODE_ENV !== 'production') {
      // Surface unknown keys loudly during development; in production we
      // degrade to the key so the UI doesn't break on a missing translation.
      console.warn(`[i18n] missing key: ${key}`)
    }
    return key
  }
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? '' : String(value)
  })
}

/** Pluralization helper: `tPlural(count, 'item', 'items')`. */
export function tPlural(count: number, singularKey: string, pluralKey: string): string {
  return t(count === 1 ? singularKey : pluralKey, { count })
}
