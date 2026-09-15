import Link from 'next/link'
import { Suspense } from 'react'
import HealthChip from './HealthChip'
import { logout } from './actions'
import NavLinks from './NavLinks'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Jobscout
          </Link>
          <Suspense fallback={null}>
            <HealthChip />
          </Suspense>
          <form action={logout}>
            <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Sign out
            </button>
          </form>
        </div>
        <NavLinks />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">{children}</main>
    </div>
  )
}
