'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Feed = { key: string; label: string }

// "Jobby › [person] › [feed]" — only on the inbox. Feeds are the active
// person's (from the server layout); the last pick is remembered per person.
export default function FeedSwitcher({ profile, feeds }: { profile: string; feeds: Feed[] }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const feedParam = params.get('feed')
  const onInbox = pathname === '/'
  const FEEDS: Feed[] = [{ key: 'all', label: 'All' }, ...feeds]
  const STORE_KEY = `jobby.feed.${profile}`

  const raw = feedParam ?? 'all'
  const current = FEEDS.some((f) => f.key === raw) ? raw : 'all'

  // Restore the last-selected feed when landing on a bare inbox URL.
  useEffect(() => {
    if (!onInbox || feedParam != null) return
    const saved = localStorage.getItem(STORE_KEY)
    if (saved && saved !== 'all' && FEEDS.some((f) => f.key === saved)) {
      router.replace(`/?feed=${saved}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  if (!onInbox) return null

  const label = FEEDS.find((f) => f.key === current)?.label ?? 'All'

  return (
    <>
      <span className="shrink-0 text-zinc-400">›</span>
      {/* Plain text label + chevron; an invisible native select sits on top so the
          control stays as tight as the current label instead of the widest option. */}
      <span className="relative inline-flex min-w-0 cursor-pointer items-center gap-1 text-base font-semibold text-zinc-800 dark:text-zinc-100">
        <span className="truncate">{label}</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <select
          aria-label="Role feed"
          value={current}
          onChange={(e) => {
            const v = e.target.value
            localStorage.setItem(STORE_KEY, v)
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
