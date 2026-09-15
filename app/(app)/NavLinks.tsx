'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Inbox' },
  { href: '/interested', label: 'Interested' },
  { href: '/companies', label: 'Companies' },
  { href: '/settings', label: 'Settings' },
]

export default function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="flex w-full gap-1 px-6">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
