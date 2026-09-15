'use client'

import { useMemo, useState } from 'react'
import CompanyToggle from './CompanyToggle'

export type CompanyRow = {
  id: number
  name: string
  atsType: string
  slug: string | null
  active: boolean
  consecutiveFailures: number
  jobCount: number
}

export default function CompaniesList({ companies }: { companies: CompanyRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((c) =>
      `${c.name} ${c.slug ?? ''} ${c.atsType}`.toLowerCase().includes(q),
    )
  }, [companies, query])

  const activeCount = companies.filter((c) => c.active).length

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search companies…"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-100"
      />

      <p className="text-xs text-zinc-400">
        {query ? `${filtered.length} match · ` : ''}
        {activeCount} active of {companies.length} · re-run the seed via{' '}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">npm run seed</code>
      </p>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No companies match “{query}”.</p>
      ) : (
        <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {c.atsType}
                  {c.slug ? ` · ${c.slug}` : ''} · {c.jobCount} job{c.jobCount === 1 ? '' : 's'}
                  {c.consecutiveFailures > 0 ? (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      · ⚠ {c.consecutiveFailures} fail{c.consecutiveFailures === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </p>
              </div>
              <CompanyToggle id={c.id} active={c.active} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
