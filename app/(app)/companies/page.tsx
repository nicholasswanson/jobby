import { getCompaniesWithJobCounts } from '@/lib/db/queries'
import CompanyToggle from './CompanyToggle'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  const companies = await getCompaniesWithJobCounts()
  const activeCount = companies.filter((c) => c.active).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">
        {activeCount} active of {companies.length} · re-run the seed via{' '}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">npm run seed</code>
      </p>

      <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {companies.map((c) => (
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
    </div>
  )
}
