import { countNewSince, getLatestRun } from '@/lib/db/queries'
import { getCurrentProfile } from '@/lib/profile'
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
    return <Chip>Not updated yet</Chip>
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

  // "N new" is per person: this profile's inbox rows first seen by the latest run.
  let newCount = 0
  if (!latest.skipped && latest.startedAt) {
    try {
      newCount = await countNewSince(await getCurrentProfile(), new Date(latest.startedAt))
    } catch {
      newCount = latest.newJobs ?? 0
    }
  }
  // Phones (<sm) only get the part that changes what you do — "N new" — so the
  // person + feed switchers on the left keep their room; sm+ shows the full text.
  const prefix = latest.skipped ? `Idle (overnight) · ${ago}` : `Last updated ${ago} · `
  return (
    <Chip stale={stale}>
      <span className="hidden sm:inline">{prefix}</span>
      {latest.skipped ? null : `${newCount} new`}
    </Chip>
  )
}

function Chip({ children, stale }: { children: React.ReactNode; stale?: boolean }) {
  return (
    <span className={`shrink-0 text-xs ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
      {children}
    </span>
  )
}
