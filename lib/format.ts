import type { RemoteType } from './filters'

/** Compact relative date like "just now", "3h", "5d", "2w". */
export function relativeDate(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const mins = Math.round((now.getTime() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

// Remote/location badges removed — the location line already conveys this, and
// the pills were noise. Kept as a nulled map so all `badge ? …` guards no-op.
export const REMOTE_BADGES: Record<RemoteType, { label: string; className: string } | null> = {
  remote: null,
  remote_us: null,
  remote_restricted: null,
}
