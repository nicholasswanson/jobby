'use client'

import { useState } from 'react'
import { REMOTE_BADGES } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import JobDetailPanel from '../JobDetailPanel'

export type InterestedItem = {
  id: number
  companyName: string
  title: string
  snippet: string | null
  location: string | null
  remoteType: RemoteType | null
  salaryText: string | null
  url: string
  savedLabel: string | null
  closedWhileInterested: boolean
}

export default function InterestedList({ items }: { items: InterestedItem[] }) {
  const [detailId, setDetailId] = useState<number | null>(null)

  return (
    <>
      <p className="mb-3 text-xs text-zinc-400">{items.length} in your pipeline</p>
      <div className="space-y-3">
        {items.map((r) => {
          const badge = r.remoteType ? REMOTE_BADGES[r.remoteType] : null
          return (
            <div
              key={r.id}
              onClick={() => setDetailId(r.id)}
              className="cursor-pointer rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-500">{r.companyName}</p>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
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
                {r.savedLabel ? <span>· saved {r.savedLabel} ago</span> : null}
              </div>

              {r.snippet ? (
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {r.snippet}
                </p>
              ) : null}

              {r.closedWhileInterested ? (
                <p className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  ⚠ This posting has closed on the company board
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      <JobDetailPanel jobId={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
