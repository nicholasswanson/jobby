'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { REMOTE_BADGES } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/pipeline'
import { setPipelineStage } from '../actions'
import { factsLine } from '../InboxList'
import { usePanel } from '../PanelProvider'

export type InterestedItem = {
  id: number
  companyName: string
  title: string
  snippet: string | null
  location: string | null
  remoteType: RemoteType | null
  salaryText: string | null
  url: string
  savedLabel: string | null
  closedWhileInterested: boolean
  stage: PipelineStage
  industry: string | null
  teamSize: number | null
  fundingStage: string | null
  batch: string | null
}

type StageMove = { id: number; stage: PipelineStage }

export default function InterestedList({ items }: { items: InterestedItem[] }) {
  const { openJob } = usePanel()
  const [, startTransition] = useTransition()
  const [optimisticItems, moveOptimistic] = useOptimistic(items, (state, m: StageMove) =>
    state.map((i) => (i.id === m.id ? { ...i, stage: m.stage } : i)),
  )
  const [showInactive, setShowInactive] = useState(false)

  const move = (id: number, stage: PipelineStage) => {
    startTransition(async () => {
      moveOptimistic({ id, stage })
      await setPipelineStage(id, stage)
    })
  }

  const active = optimisticItems.filter((i) => i.stage !== 'inactive')
  const inactive = optimisticItems.filter((i) => i.stage === 'inactive')

  return (
    <>
      <p className="mb-3 text-xs text-zinc-400">
        {active.length} in your pipeline{inactive.length ? ` · ${inactive.length} inactive` : ''}
      </p>

      {PIPELINE_STAGES.filter((s) => s.key !== 'inactive').map((s) => {
        const group = active.filter((i) => i.stage === s.key)
        if (group.length === 0) return null
        return (
          <section key={s.key} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {s.label} <span className="font-normal text-zinc-400">({group.length})</span>
            </h2>
            <div className="space-y-3">
              {group.map((r) => (
                <Card key={r.id} item={r} onOpen={() => openJob(r.id)} onMove={move} />
              ))}
            </div>
          </section>
        )
      })}

      {inactive.length ? (
        <section className="mb-6">
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="mb-2 flex items-center gap-1 text-sm font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <span className={`inline-block transition-transform ${showInactive ? 'rotate-90' : ''}`}>›</span>
            Inactive <span className="font-normal text-zinc-400">({inactive.length})</span>
          </button>
          {showInactive ? (
            <div className="space-y-3 opacity-70">
              {inactive.map((r) => (
                <Card key={r.id} item={r} onOpen={() => openJob(r.id)} onMove={move} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function Card({
  item: r,
  onOpen,
  onMove,
}: {
  item: InterestedItem
  onOpen: () => void
  onMove: (id: number, stage: PipelineStage) => void
}) {
  const badge = r.remoteType ? REMOTE_BADGES[r.remoteType] : null
  const facts = factsLine({ industry: r.industry, teamSize: r.teamSize, stage: r.fundingStage, batch: r.batch })
  return (
    <div
      onClick={onOpen}
      className="cursor-pointer rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-500">{r.companyName}</p>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block text-base font-semibold leading-snug hover:underline"
          >
            {r.title}
          </a>
        </div>
        {badge ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
        {r.location ? <span>{r.location}</span> : null}
        {r.salaryText ? <span>· {r.salaryText}</span> : null}
        {r.savedLabel ? <span>· saved {r.savedLabel} ago</span> : null}
      </div>
      {facts ? <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{facts}</p> : null}

      {r.snippet ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {r.snippet}
        </p>
      ) : null}

      {r.closedWhileInterested ? (
        <p className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          ⚠ This posting has closed on the company board
        </p>
      ) : null}

      {/* Stage picker: plain label + chevron with an invisible native select on top
          (same pattern as the feed switcher — works well on a phone). */}
      <div className="mt-3 flex items-center gap-1 text-xs text-zinc-500" onClick={(e) => e.stopPropagation()}>
        <span>Stage</span>
        <span className="relative inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
          {PIPELINE_STAGES.find((s) => s.key === r.stage)?.label}
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <select
            aria-label="Pipeline stage"
            value={r.stage}
            onChange={(e) => onMove(r.id, e.target.value as PipelineStage)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>
    </div>
  )
}
