'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { REMOTE_BADGES } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import { triageJob } from './actions'
import JobDetailPanel from './JobDetailPanel'

export type InboxItem = {
  id: number
  companyName: string
  title: string
  snippet: string | null
  location: string | null
  remoteType: RemoteType | null
  salaryText: string | null
  url: string
  postedLabel: string
  postedAtMs: number | null
}

const DAY = 86_400_000
const DATE_FILTERS = [
  { key: 'any', label: 'Any time', days: null },
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: 'Past 7 days', days: 7 },
  { key: '30d', label: 'Past 30 days', days: 30 },
] as const

export default function InboxList({ items }: { items: InboxItem[] }) {
  const [optimisticItems, removeItem] = useOptimistic(items, (state, id: number) =>
    state.filter((i) => i.id !== id),
  )
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState(0)
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]['key']>('any')
  const [detailId, setDetailId] = useState<number | null>(null)

  // Apply the posted-date filter (client-side; the 90-day hard cap is server-side).
  const visible = useMemo(() => {
    const conf = DATE_FILTERS.find((f) => f.key === dateFilter)
    if (!conf?.days) return optimisticItems
    const cutoff = Date.now() - conf.days * DAY
    return optimisticItems.filter((i) => i.postedAtMs != null && i.postedAtMs >= cutoff)
  }, [optimisticItems, dateFilter])

  const triage = (id: number, status: 'interested' | 'not_a_fit') => {
    startTransition(async () => {
      removeItem(id)
      await triageJob(id, status)
    })
  }

  // Keyboard: I = interested, X = not a fit, J/K = navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (detailId != null) return // panel handles its own keys
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
        <p className="text-xs text-zinc-400">
          {visible.length} to review · <kbd>I</kbd>/<kbd>X</kbd> · <kbd>J</kbd>/<kbd>K</kbd>
        </p>
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          Posted
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
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
        <div className="space-y-3">
          {visible.map((item, idx) => (
            <JobCard
              key={item.id}
              item={item}
              selected={idx === Math.min(selected, visible.length - 1)}
              onOpen={() => setDetailId(item.id)}
              onTriage={triage}
            />
          ))}
        </div>
      )}

      <JobDetailPanel jobId={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}

function JobCard({
  item,
  selected,
  onOpen,
  onTriage,
}: {
  item: InboxItem
  selected: boolean
  onOpen: () => void
  onTriage: (id: number, status: 'interested' | 'not_a_fit') => void
}) {
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const badge = item.remoteType ? REMOTE_BADGES[item.remoteType] : null

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
        selected
          ? 'border-zinc-900 shadow-sm dark:border-zinc-100'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-500">{item.companyName}</p>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block text-base font-semibold leading-snug hover:underline"
          >
            {item.title}
          </a>
        </div>
        {badge ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
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
    </div>
  )
}
