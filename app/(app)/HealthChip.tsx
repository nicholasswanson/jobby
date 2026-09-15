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
    return <Chip>No crawl yet</Chip>
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

  // Plain gray text, no pill (amber text only when stale).
  return <Chip stale={stale}>{label}</Chip>
}

function Chip({ children, stale }: { children: React.ReactNode; stale?: boolean }) {
  return (
    <span className={`text-xs ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
      {children}
    </span>
  )
}
