import Link from 'next/link'
import { Suspense } from 'react'
import { AUTH_ENABLED } from '@/lib/auth'
import HealthChip from './HealthChip'
import { logout } from './actions'
import NavLinks from './NavLinks'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Jobby
          </Link>
          <Suspense fallback={null}>
            <HealthChip />
          </Suspense>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <Link href="/settings" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Settings
            </Link>
            {AUTH_ENABLED ? (
              <form action={logout}>
                <button className="hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
              </form>
            ) : null}
          </div>
        </div>
        <NavLinks />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">{children}</main>
    </div>
  )
}
