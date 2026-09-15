import { getInterested } from '@/lib/db/queries'
import { relativeDate, REMOTE_BADGES } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'

export const dynamic = 'force-dynamic'

export default async function InterestedPage() {
  const rows = await getInterested()
  const now = new Date()

  if (rows.length === 0) {
    return (
      <div className="mt-20 text-center text-zinc-500">
        <p className="text-lg font-medium">No saved roles yet</p>
        <p className="mt-1 text-sm">Mark inbox cards “Interested” and they’ll collect here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">{rows.length} in your pipeline</p>
      {rows.map((r) => {
        const badge = r.remoteType ? REMOTE_BADGES[r.remoteType as RemoteType] : null
        return (
          <div key={r.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-500">{r.companyName}</p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-base font-semibold leading-snug hover:underline"
                >
                  {r.title}
                </a>
              </div>
              {badge ? (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
              {r.location ? <span>{r.location}</span> : null}
              {r.salaryText ? <span>· {r.salaryText}</span> : null}
              {r.triagedAt ? <span>· saved {relativeDate(r.triagedAt, now)} ago</span> : null}
            </div>

            {r.closedWhileInterested ? (
              <p className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                ⚠ This posting has closed on the company board
              </p>
            ) : null}

            {/* Stub actions column — future: draft outreach, mark applied. */}
            <div className="mt-3 text-xs text-zinc-400">Actions (draft outreach, mark applied) — coming soon</div>
          </div>
        )
      })}
    </div>
  )
}
