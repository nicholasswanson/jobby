'use client'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { REMOTE_BADGES } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import { triageJob } from './actions'

export type InboxItem = {
  id: number
  companyName: string
  title: string
  location: string | null
  remoteType: RemoteType | null
  salaryText: string | null
  url: string
  postedLabel: string
}

export default function InboxList({ items }: { items: InboxItem[] }) {
  // Optimistic list: triaging an item removes it immediately.
  const [optimisticItems, removeItem] = useOptimistic(items, (state, id: number) =>
    state.filter((i) => i.id !== id),
  )
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState(0)

  const triage = (id: number, status: 'interested' | 'not_a_fit') => {
    startTransition(async () => {
      removeItem(id)
      await triageJob(id, status)
    })
  }

  // Keyboard: I = interested, X = not a fit, J/K = navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const list = optimisticItems
      if (list.length === 0) return
      const cur = Math.min(selected, list.length - 1)
      switch (e.key.toLowerCase()) {
        case 'j':
          setSelected((s) => Math.min(s + 1, list.length - 1))
          break
        case 'k':
          setSelected((s) => Math.max(s - 1, 0))
          break
        case 'i':
          triage(list[cur].id, 'interested')
          break
        case 'x':
          triage(list[cur].id, 'not_a_fit')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticItems, selected])

  if (optimisticItems.length === 0) {
    return (
      <div className="mt-20 text-center text-zinc-500">
        <p className="text-lg font-medium">Inbox zero 🎉</p>
        <p className="mt-1 text-sm">New roles appear here after the next crawl (~30 min).</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">
        {optimisticItems.length} to review · <kbd>I</kbd> interested · <kbd>X</kbd> not a fit ·{' '}
        <kbd>J</kbd>/<kbd>K</kbd> to move
      </p>
      {optimisticItems.map((item, idx) => (
        <JobCard
          key={item.id}
          item={item}
          selected={idx === Math.min(selected, optimisticItems.length - 1)}
          onSelect={() => setSelected(idx)}
          onTriage={triage}
        />
      ))}
    </div>
  )
}

function JobCard({
  item,
  selected,
  onSelect,
  onTriage,
}: {
  item: InboxItem
  selected: boolean
  onSelect: () => void
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
      onClick={onSelect}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
      className={`rounded-2xl border p-4 transition-shadow ${
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
