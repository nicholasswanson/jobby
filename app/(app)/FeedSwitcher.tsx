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
  const label = FEEDS.find((f) => f.key === current)?.label ?? 'All'

  return (
    <>
      <span className="text-zinc-400">›</span>
      {/* Plain text label + chevron; an invisible native select sits on top so the
          control stays as tight as the current label instead of the widest option. */}
      <span className="relative inline-flex cursor-pointer items-center gap-1 text-base font-semibold text-zinc-800 dark:text-zinc-100">
        {label}
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <select
          aria-label="Role feed"
          value={current}
          onChange={(e) => {
            const v = e.target.value
            router.push(v === 'all' ? '/' : `/?feed=${v}`)
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {FEEDS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </span>
    </>
  )
}
