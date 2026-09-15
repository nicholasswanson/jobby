'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import type { RemoteType } from '@/lib/filters'
import { hideCompanyFromInbox, triageJob } from './actions'
import { usePanel } from './PanelProvider'

export type InboxItem = {
  id: number
  companyId: number
  companyName: string
  title: string
  snippet: string | null
  location: string | null
  remoteType: RemoteType | null
  salaryText: string | null
  url: string
  postedLabel: string
  postedAtMs: number | null
  isNew: boolean
}

type RemoveAction = { kind: 'job'; id: number } | { kind: 'company'; companyId: number }

const DAY = 86_400_000
const DATE_FILTERS = [
  { key: 'any', label: 'Any time', days: null },
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: 'Past 7 days', days: 7 },
  { key: '30d', label: 'Past 30 days', days: 30 },
] as const

export default function InboxList({ items }: { items: InboxItem[] }) {
  const [optimisticItems, removeOptimistic] = useOptimistic(
    items,
    (state, action: RemoveAction) =>
      action.kind === 'job'
        ? state.filter((i) => i.id !== action.id)
        : state.filter((i) => i.companyId !== action.companyId),
  )
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState(0)
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]['key']>('any')
  const { jobId: detailId, openJob, close } = usePanel()

  // Remember the posted-date range locally between visits.
  useEffect(() => {
    const saved = localStorage.getItem('jobby.posted')
    if (saved && DATE_FILTERS.some((f) => f.key === saved)) {
      setDateFilter(saved as typeof dateFilter)
    }
  }, [])
  const setPosted = (key: typeof dateFilter) => {
    setDateFilter(key)
    localStorage.setItem('jobby.posted', key)
  }

  const visible = useMemo(() => {
    const conf = DATE_FILTERS.find((f) => f.key === dateFilter)
    if (!conf?.days) return optimisticItems
    const cutoff = Date.now() - conf.days * DAY
    return optimisticItems.filter((i) => i.postedAtMs != null && i.postedAtMs >= cutoff)
  }, [optimisticItems, dateFilter])

  const triage = (id: number, status: 'interested' | 'not_a_fit') => {
    startTransition(async () => {
      removeOptimistic({ kind: 'job', id })
      if (detailId === id && status === 'not_a_fit') close()
      await triageJob(id, status)
    })
  }

  const hideCompany = (companyId: number) => {
    startTransition(async () => {
      removeOptimistic({ kind: 'company', companyId })
      await hideCompanyFromInbox(companyId)
    })
  }

  // Keyboard: I = interested, X = not a fit, J/K = navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (detailId != null) return
      if (visible.length === 0) return
      const cur = Math.min(selected, visible.length - 1)
      switch (e.key.toLowerCase()) {
        case 'j':
          setSelected((s) => Math.min(s + 1, visible.length - 1))
          break
        case 'k':
          setSelected((s) => Math.max(s - 1, 0))
          break
        case 'i':
          triage(visible[cur].id, 'interested')
          break
        case 'x':
          triage(visible[cur].id, 'not_a_fit')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selected, detailId])

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">{visible.length} to review</p>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          Posted
          <select
            value={dateFilter}
            onChange={(e) => setPosted(e.target.value as typeof dateFilter)}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-zinc-500 focus:outline-none"
          >
            {DATE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="mt-20 text-center text-zinc-500">
          <p className="text-lg font-medium">
            {optimisticItems.length === 0 ? 'Inbox zero 🎉' : 'Nothing in this window'}
          </p>
          <p className="mt-1 text-sm">
            {optimisticItems.length === 0
              ? 'New roles appear here after the next crawl (~30 min).'
              : 'Try a wider posted-date range.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((item, idx) => (
            <JobCard
              key={item.id}
              item={item}
              selected={idx === Math.min(selected, visible.length - 1)}
              isOpen={detailId === item.id}
              onOpen={() => openJob(item.id)}
              onTriage={triage}
              onHideCompany={hideCompany}
            />
          ))}
        </div>
      )}
    </>
  )
}

function JobCard({
  item,
  selected,
  isOpen,
  onOpen,
  onTriage,
  onHideCompany,
}: {
  item: InboxItem
  selected: boolean
  isOpen: boolean
  onOpen: () => void
  onTriage: (id: number, status: 'interested' | 'not_a_fit') => void
  onHideCompany: (companyId: number) => void
}) {
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return
    setDragX(e.touches[0].clientX - startX.current)
  }
  const onTouchEnd = () => {
    if (dragX > 80) onTriage(item.id, 'interested')
    else if (dragX < -80) onTriage(item.id, 'not_a_fit')
    setDragX(0)
    startX.current = null
  }

  return (
    <div
      onClick={onOpen}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
      className={`cursor-pointer rounded-2xl border p-4 transition-shadow ${
        isOpen
          ? 'border-zinc-900 shadow-sm dark:border-zinc-100' // white outline = open in the panel
          : selected
            ? 'border-zinc-300 dark:border-zinc-700' // faint = keyboard-selected
            : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <p className="truncate text-sm text-zinc-500">{item.companyName}</p>
      <div className="flex items-baseline gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 text-base font-semibold leading-snug hover:underline"
        >
          {item.title}
        </a>
        {item.isNew ? (
          <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            New
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        {item.location ? <span>{item.location}</span> : null}
        {item.salaryText ? <span>· {item.salaryText}</span> : null}
        {item.postedLabel ? <span>· {item.postedLabel}</span> : null}
      </div>

      {item.snippet ? (
        <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {item.snippet}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTriage(item.id, 'interested')
          }}
          className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Interested
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTriage(item.id, 'not_a_fit')
          }}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          Not a fit
        </button>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onHideCompany(item.companyId)
        }}
        className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
      >
        Don’t show {item.companyName}
      </button>
    </div>
  )
}
