import Link from 'next/link'
import { Suspense } from 'react'
import { AUTH_ENABLED } from '@/lib/auth'
import { getSearchProfile, SEARCH_PROFILES } from '@/lib/filters'
import { getCurrentProfile } from '@/lib/profile'
import HealthChip from './HealthChip'
import CrawlNowButton from './CrawlNowButton'
import FeedSwitcher from './FeedSwitcher'
import { logout } from './actions'
import NavLinks from './NavLinks'
import PanelProvider from './PanelProvider'
import ProfileSwitcher from './ProfileSwitcher'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const who = await getCurrentProfile()
  const people = Object.values(SEARCH_PROFILES).map((p) => ({ key: p.key, label: p.label }))
  const feeds = getSearchProfile(who).feeds.map((f) => ({ key: f.key, label: f.label }))
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex w-full items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
              Jobby
            </Link>
            <ProfileSwitcher current={who} people={people} />
            <Suspense fallback={null}>
              <FeedSwitcher profile={who} feeds={feeds} />
            </Suspense>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Suspense fallback={null}>
              <HealthChip />
            </Suspense>
            <CrawlNowButton />
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

      {/* Suspense: PanelProvider reads useSearchParams (the open ?job=). */}
      <Suspense fallback={<div className="mx-auto w-full max-w-2xl px-6 py-4">{children}</div>}>
        <PanelProvider>{children}</PanelProvider>
      </Suspense>
    </div>
  )
}
