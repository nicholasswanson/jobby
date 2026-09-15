import { getLatestRun } from '@/lib/db/queries'
import { getPacificHour } from '@/lib/time'

// "Last crawl 14 min ago · 3 new" — turns amber when the latest run is stale
// (>90 min) during active hours (06:00–23:00 PT).
export default async function HealthChip() {
  let latest
  try {
    ;[latest] = await getLatestRun()
  } catch {
    return null
  }

  if (!latest) {
    return <Chip tone="muted">No crawl yet</Chip>
  }

  const finished = latest.finishedAt ? new Date(latest.finishedAt) : null
  const now = new Date()
  const minsAgo = finished ? Math.round((now.getTime() - finished.getTime()) / 60000) : null

  const hour = getPacificHour(now)
  const activeHours = hour >= 6 && hour < 23
  const stale = activeHours && minsAgo != null && minsAgo > 90

  const ago =
    minsAgo == null
      ? 'unknown'
      : minsAgo < 1
        ? 'just now'
        : minsAgo < 60
          ? `${minsAgo} min ago`
          : `${Math.floor(minsAgo / 60)}h ${minsAgo % 60}m ago`

  const newCount = latest.newJobs ?? 0
  const label = latest.skipped
    ? `Idle (overnight) · ${ago}`
    : `Last crawl ${ago} · ${newCount} new`

  return <Chip tone={stale ? 'warn' : 'ok'}>{label}</Chip>
}

function Chip({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'muted' }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    muted: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
