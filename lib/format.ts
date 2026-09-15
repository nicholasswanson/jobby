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

export const REMOTE_BADGES: Record<RemoteType, { label: string; className: string }> = {
  remote: {
    label: 'Remote',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  remote_us: {
    label: 'Remote · US',
    className: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  },
  remote_restricted: {
    label: '⚠ verify',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
}
