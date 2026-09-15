'use client'

import { useState, useTransition } from 'react'
import { restoreJobToInbox, setCompanyActive } from '../actions'
import ResumeTab, { type ProfileData, type ResumeMeta } from './ResumeTab'

type Blocked = { id: number; name: string; atsType: string; slug: string | null }
type Activity = {
  id: number
  title: string
  url: string
  status: 'interested' | 'not_a_fit'
  companyName: string
  whenLabel: string
}
type Filtered = {
  id: number
  title: string
  snippet: string | null
  location: string | null
  url: string
  reason: 'seniority' | 'geo' | 'onsite' | null
  companyName: string
}

const TABS = [
  { key: 'resume', label: 'Résumé' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'activity', label: 'Activity' },
  { key: 'filtered', label: 'Filtered out' },
] as const

const REASON_LABEL: Record<string, string> = {
  seniority: 'Too senior',
  geo: 'Outside North America',
  onsite: 'On-site / hybrid',
}

export default function SettingsView({
  resume,
  profile,
  blocked,
  activity,
  filtered,
}: {
  resume: ResumeMeta
  profile: ProfileData
  blocked: Blocked[]
  activity: Activity[]
  filtered: Filtered[]
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('resume')

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Settings</h1>

      <div className="mb-4 inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === t.key
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
            {t.key === 'filtered' && filtered.length ? ` (${filtered.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'resume' ? <ResumeTab resume={resume} profile={profile} /> : null}
      {tab === 'blocked' ? <BlockedTab items={blocked} /> : null}
      {tab === 'activity' ? <ActivityTab items={activity} /> : null}
      {tab === 'filtered' ? <FilteredTab items={filtered} /> : null}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-zinc-500">{children}</p>
}

function BlockedTab({ items }: { items: Blocked[] }) {
  const [pending, start] = useTransition()
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const visible = items.filter((c) => !hidden.has(c.id))

  if (visible.length === 0) return <Empty>No blocked companies. Mute a company from the Companies tab.</Empty>

  return (
    <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {visible.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="truncate text-xs text-zinc-500">
              {c.atsType}
              {c.slug ? ` · ${c.slug}` : ''}
            </p>
          </div>
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setHidden((h) => new Set(h).add(c.id))
                await setCompanyActive(c.id, true)
              })
            }
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  )
}

function ActivityTab({ items }: { items: Activity[] }) {
  const [restored, setRestored] = useState<Set<number>>(new Set())
  const [pending, start] = useTransition()

  if (items.length === 0) return <Empty>No triage history yet.</Empty>

  return (
    <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm">
              <span
                className={`mr-2 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                  a.status === 'interested'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                {a.status === 'interested' ? 'Interested' : 'Not a fit'}
              </span>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                {a.title}
              </a>
            </p>
            <p className="truncate text-xs text-zinc-500">
              {a.companyName}
              {a.whenLabel ? ` · ${a.whenLabel} ago` : ''}
            </p>
          </div>
          {restored.has(a.id) ? (
            <span className="shrink-0 text-xs text-zinc-400">Moved →</span>
          ) : (
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setRestored((s) => new Set(s).add(a.id))
                  await restoreJobToInbox(a.id)
                })
              }
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              To inbox
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function FilteredTab({ items }: { items: Filtered[] }) {
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [pending, start] = useTransition()
  const visible = items.filter((f) => !added.has(f.id))

  if (visible.length === 0) return <Empty>Nothing filtered out in the last 90 days.</Empty>

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">
        Relevant roles the filter excluded. Review and add any back to your inbox.
      </p>
      {visible.map((f) => (
        <div key={f.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-500">{f.companyName}</p>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block text-base font-semibold leading-snug hover:underline">
                {f.title}
              </a>
            </div>
            {f.reason ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {REASON_LABEL[f.reason] ?? f.reason}
              </span>
            ) : null}
          </div>
          {f.location ? <p className="mt-1 text-xs text-zinc-500">{f.location}</p> : null}
          {f.snippet ? (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{f.snippet}</p>
          ) : null}
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setAdded((s) => new Set(s).add(f.id))
                await restoreJobToInbox(f.id)
              })
            }
            className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add to inbox
          </button>
        </div>
      ))}
    </div>
  )
}
