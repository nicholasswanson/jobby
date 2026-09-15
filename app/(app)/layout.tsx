import Link from 'next/link'
import { Suspense } from 'react'
import { AUTH_ENABLED } from '@/lib/auth'
import HealthChip from './HealthChip'
import { logout } from './actions'
import NavLinks from './NavLinks'
import PanelProvider from './PanelProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Jobby
          </Link>
          <div className="flex items-center gap-3">
            <Suspense fallback={null}>
              <HealthChip />
            </Suspense>
            {AUTH_ENABLED ? (
              <form action={logout}>
                <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
        <NavLinks />
      </header>

      <PanelProvider>{children}</PanelProvider>
    </div>
  )
}
