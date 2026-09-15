'use client'

import { useState, useTransition } from 'react'
import { setCompanyActive } from '../actions'

export default function CompanyToggle({ id, active }: { id: number; active: boolean }) {
  const [on, setOn] = useState(active)
  const [pending, startTransition] = useTransition()

  const toggle = () => {
    const next = !on
    setOn(next) // optimistic
    startTransition(async () => {
      try {
        await setCompanyActive(id, next)
      } catch {
        setOn(!next) // revert on failure
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Mute company' : 'Unmute company'}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
