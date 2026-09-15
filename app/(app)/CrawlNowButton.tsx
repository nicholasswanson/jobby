'use client'

import { useState, useTransition } from 'react'
import { crawlNow } from './actions'

export default function CrawlNowButton() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const ok = await crawlNow()
          setMsg(ok ? 'Started — updates in ~1 min' : 'Not configured')
          setTimeout(() => setMsg(null), 6000)
        })
      }
      className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
      title="Refresh listings now"
    >
      {pending ? 'Refreshing…' : (msg ?? 'Refresh')}
    </button>
  )
}
