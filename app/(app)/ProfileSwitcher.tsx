'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { switchProfile } from './actions'

type Person = { key: string; label: string }

// "Jobby › [person]" — picks whose search the whole app shows. Same invisible
// native-select pattern as FeedSwitcher so the control is as tight as its label.
export default function ProfileSwitcher({ current, people }: { current: string; people: Person[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const label = people.find((p) => p.key === current)?.label ?? current

  return (
    <>
      <span className="shrink-0 text-zinc-400">›</span>
      <span
        className={`relative inline-flex shrink-0 cursor-pointer items-center gap-1 text-base font-semibold text-zinc-800 dark:text-zinc-100 ${
          pending ? 'opacity-50' : ''
        }`}
      >
        {label}
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <select
          aria-label="Whose search"
          value={current}
          disabled={pending}
          onChange={(e) => {
            const key = e.target.value
            if (key === current) return
            startTransition(async () => {
              await switchProfile(key)
              // '/' drops any ?job= (that job belongs to the previous person).
              router.push('/')
              router.refresh()
            })
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </span>
    </>
  )
}
