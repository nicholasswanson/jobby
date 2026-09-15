'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const FEEDS = [
  { key: 'all', label: 'All' },
  { key: 'account_management', label: 'Account Management' },
  { key: 'sales', label: 'Entry-level Sales' },
  { key: 'engineering', label: 'Engineering' },
] as const

// "Jobby › [feed]" — only on the inbox.
export default function FeedSwitcher() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  if (pathname !== '/') return null

  const raw = params.get('feed') ?? 'all'
  const current = FEEDS.some((f) => f.key === raw) ? raw : 'all'

  return (
    <>
      <span className="text-zinc-400">›</span>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value
          router.push(v === 'all' ? '/' : `/?feed=${v}`)
        }}
        className="cursor-pointer border-0 bg-transparent p-0 text-base font-semibold text-zinc-800 focus:outline-none dark:text-zinc-100"
      >
        {FEEDS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
    </>
  )
}
