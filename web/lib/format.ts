// Light formatters shared by the UI. Don't pull in date-fns for one or two helpers.

export function formatAge(months: number | null): string | null {
  if (months === null || months < 0) return null
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths === 0 ? `${years} yr` : `${years} yr ${remMonths} mo`
}

export function titleCase(value: string | null | undefined): string | null {
  if (!value) return null
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

export function relativeFromNow(iso: string | null | undefined): string | null {
  if (!iso) return null
  const past = new Date(iso).getTime()
  if (Number.isNaN(past)) return null
  const seconds = Math.max(0, Math.floor((Date.now() - past) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
  })
}
