'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import type { RemoteType } from '@/lib/filters'
import { hideCompanyFromInbox, restoreJobToInbox, triageJob } from './actions'
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

type TriageStatus = 'interested' | 'not_a_fit'

type ListAction =
  | { kind: 'job'; id: number }
  | { kind: 'company'; companyId: number }
  | { kind: 'restore'; item: InboxItem; index: number }

type Toast = { item: InboxItem; index: number; status: TriageStatus; key: number }

const DAY = 86_400_000
const DATE_FILTERS = [
  { key: 'any', label: 'Any time', days: null },
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: 'Past 7 days', days: 7 },
  { key: '30d', label: 'Past 30 days', days: 30 },
] as const

// Swipe: distance that commits, and how long the fly-out takes (matches the CSS).
const SWIPE_COMMIT_PX = 80
const FLY_OUT_MS = 220
const TOAST_MS = 5000

export default function InboxList({ items }: { items: InboxItem[] }) {
  const [optimisticItems, applyOptimistic] = useOptimistic(items, (state, action: ListAction) => {
    switch (action.kind) {
      case 'job':
        return state.filter((i) => i.id !== action.id)
      case 'company':
        return state.filter((i) => i.companyId !== action.companyId)
      case 'restore': {
        if (state.some((i) => i.id === action.item.id)) return state
        const next = [...state]
        next.splice(Math.min(action.index, next.length), 0, action.item)
        return next
      }
    }
  })
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState(0)
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]['key']>('any')
  // Cards mid fly-out (id → direction). Removed from the list once the animation ends.
  const [leaving, setLeaving] = useState<Record<number, TriageStatus>>({})
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const showToast = (t: Omit<Toast, 'key'>) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ ...t, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  /** Fly the card out, then remove it + persist. Used by swipe, buttons and keys. */
  const triage = (id: number, status: TriageStatus) => {
    if (leaving[id]) return
    const index = optimisticItems.findIndex((i) => i.id === id)
    const item = optimisticItems[index]
    if (!item) return
    setLeaving((l) => ({ ...l, [id]: status }))
    try {
      navigator.vibrate?.(10)
    } catch {}
    setTimeout(() => {
      startTransition(async () => {
        applyOptimistic({ kind: 'job', id })
        setLeaving((l) => {
          const { [id]: _gone, ...rest } = l
          return rest
        })
        if (detailId === id && status === 'not_a_fit') close()
        showToast({ item, index, status })
        await triageJob(id, status)
      })
    }, FLY_OUT_MS)
  }

  const undo = (t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(null)
    startTransition(async () => {
      applyOptimistic({ kind: 'restore', item: t.item, index: t.index })
      await restoreJobToInbox(t.item.id)
    })
  }

  const hideCompany = (companyId: number) => {
    startTransition(async () => {
      applyOptimistic({ kind: 'company', companyId })
      await hideCompanyFromInbox(companyId)
    })
  }

  // Keyboard: I = interested, X = not a fit, J/K = navigate, Z = undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (detailId != null) return
      if (e.key.toLowerCase() === 'z' && toast) {
        undo(toast)
        return
      }
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
  }, [visible, selected, detailId, toast, leaving])

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">{visible.length} to review</p>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <span>Posted</span>
          {/* Plain text label + chevron; invisible native select sits on top so the
              control stays as tight as the label instead of the widest option. */}
          <span className="relative inline-flex cursor-pointer items-center gap-1 font-medium text-zinc-600 dark:text-zinc-300">
            {DATE_FILTERS.find((f) => f.key === dateFilter)?.label}
            <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <select
              aria-label="Posted date range"
              value={dateFilter}
              onChange={(e) => setPosted(e.target.value as typeof dateFilter)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {DATE_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </span>
        </div>
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
              leaving={leaving[item.id] ?? null}
              onOpen={() => openJob(item.id)}
              onTriage={triage}
              onHideCompany={hideCompany}
            />
          ))}
        </div>
      )}

      {/* Undo toast — confirms the swipe/click landed and gives 5 s to take it back. */}
      {toast ? (
        <div
          key={toast.key}
          role="status"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          className="fixed inset-x-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="min-w-0 truncate">
            {toast.status === 'interested' ? 'Saved to Interested' : 'Marked not a fit'}
            <span className="opacity-60"> · {toast.item.companyName}</span>
          </span>
          <button
            onClick={() => undo(toast)}
            className="shrink-0 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline"
          >
            Undo
          </button>
        </div>
      ) : null}
    </>
  )
}

function JobCard({
  item,
  selected,
  isOpen,
  leaving,
  onOpen,
  onTriage,
  onHideCompany,
}: {
  item: InboxItem
  selected: boolean
  isOpen: boolean
  leaving: TriageStatus | null
  onOpen: () => void
  onTriage: (id: number, status: TriageStatus) => void
  onHideCompany: (companyId: number) => void
}) {
  // Horizontal drag state. `axis` locks the gesture once it's clearly horizontal
  // (so a slightly diagonal scroll doesn't shift cards) or vertical (ignored).
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (leaving) return
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    axis.current = null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current || leaving) return
    const dx = e.touches[0].clientX - start.current.x
    const dy = e.touches[0].clientY - start.current.y
    if (axis.current == null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') setDragging(true)
    }
    if (axis.current === 'x') setDragX(dx)
  }
  const onTouchEnd = () => {
    const committed = axis.current === 'x' && Math.abs(dragX) >= SWIPE_COMMIT_PX
    if (committed) onTriage(item.id, dragX > 0 ? 'interested' : 'not_a_fit')
    // Spring back (or hand off to the fly-out, which overrides the transform).
    setDragging(false)
    setDragX(0)
    start.current = null
    axis.current = null
  }

  const reveal = Math.min(1, Math.abs(dragX) / SWIPE_COMMIT_PX)
  const dir: TriageStatus | null = leaving ?? (dragX > 0 ? 'interested' : dragX < 0 ? 'not_a_fit' : null)
  const transform = leaving
    ? `translateX(${leaving === 'interested' ? '120vw' : '-120vw'}) rotate(${leaving === 'interested' ? 4 : -4}deg)`
    : dragX
      ? `translateX(${dragX}px) rotate(${dragX / 40}deg)`
      : undefined

  return (
    <div
      onClick={onOpen}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        transform,
        opacity: leaving ? 0 : 1,
        touchAction: 'pan-y',
        transition: dragging ? 'none' : `transform ${FLY_OUT_MS}ms ease-out, opacity ${FLY_OUT_MS}ms ease-out, box-shadow 150ms`,
      }}
      className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-4 dark:bg-zinc-950 ${
        isOpen
          ? 'border-zinc-900 shadow-sm dark:border-zinc-100' // white outline = open in the panel
          : selected
            ? 'border-zinc-300 dark:border-zinc-700' // faint = keyboard-selected
            : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* Swipe reveal: green "Interested" from the left, red "Not a fit" from the right. */}
      {dir ? (
        <div
          aria-hidden
          style={{ opacity: leaving ? 1 : reveal }}
          className={`pointer-events-none absolute inset-0 flex items-center px-5 text-base font-semibold ${
            dir === 'interested'
              ? 'justify-start bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'justify-end bg-red-500/15 text-red-700 dark:text-red-300'
          }`}
        >
          {dir === 'interested' ? '✓ Interested' : 'Not a fit ✕'}
        </div>
      ) : null}

      <div className="relative" style={{ opacity: dir && !leaving ? 1 - reveal * 0.6 : 1 }}>
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
    </div>
  )
}
