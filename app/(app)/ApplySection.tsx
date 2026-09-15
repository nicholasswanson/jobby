'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { detectAts, atsLabel } from '@/lib/apply/ats'
import {
  getApplyReadiness,
  loadApplication,
  loadTailoring,
  regenerateTailoring,
  startApplication,
  submitApplication,
} from './actions'

type Tailoring = Awaited<ReturnType<typeof loadTailoring>>
type Application = Awaited<ReturnType<typeof loadApplication>>
type Readiness = Awaited<ReturnType<typeof getApplyReadiness>>

const RUNNING = new Set(['queued', 'running'])

export default function ApplySection({ jobId, applyUrl }: { jobId: number; applyUrl: string }) {
  const [tailoring, setTailoring] = useState<Tailoring>(null)
  const [application, setApplication] = useState<Application>(null)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [pending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const [t, a] = await Promise.all([loadTailoring(jobId), loadApplication(jobId)])
    setTailoring(t)
    setApplication(a)
    // Poll while anything is in flight.
    const busy = t?.status === 'pending' || (a?.status != null && RUNNING.has(a.status))
    if (busy) timer.current = setTimeout(refresh, 4000)
  }, [jobId])

  useEffect(() => {
    getApplyReadiness().then(setReadiness)
    refresh()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [refresh])

  const ats = detectAts(applyUrl)
  const status = application?.status

  return (
    <section className="mt-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Apply</h3>

      {/* Tailored résumé */}
      <div className="mt-2 text-sm">
        {!tailoring ? (
          <p className="text-zinc-500">Mark this job <em>Interested</em> to tailor your résumé.</p>
        ) : tailoring.status === 'pending' ? (
          <p className="text-zinc-500">Tailoring your résumé to this role…</p>
        ) : tailoring.status === 'error' ? (
          <p className="text-red-600">
            Tailoring failed: {tailoring.error}{' '}
            <button className="underline" onClick={() => start(() => regenerateTailoring(jobId).then(refresh))}>
              retry
            </button>
          </p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/tailored/${jobId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Download tailored résumé
              </a>
              <button
                onClick={() => start(() => regenerateTailoring(jobId).then(refresh))}
                className="text-xs text-zinc-500 hover:underline"
              >
                Regenerate
              </button>
            </div>
            {tailoring.rationale ? (
              <p className="mt-1.5 text-xs text-zinc-500">{tailoring.rationale}</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Readiness hints */}
      {readiness && (!readiness.hasResume || !readiness.hasProfile) ? (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {!readiness.hasResume ? 'Add your résumé' : 'Complete your application profile'} in{' '}
          <a href="/settings" className="underline">
            Settings
          </a>{' '}
          before applying.
        </p>
      ) : null}

      {/* Apply control */}
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {!ats ? (
          <p className="text-xs text-zinc-500">
            Not on a supported ATS (Greenhouse/Lever/Ashby).{' '}
            <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Apply manually ↗
            </a>
          </p>
        ) : status === 'submitted' ? (
          <p className="text-sm font-medium text-emerald-600">Applied ✓</p>
        ) : status === 'needs_review' ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              The agent filled the {atsLabel(ats)} form. Review, then submit.
            </p>
            {application?.screenshotBase64 ? (
              <img
                src={`data:image/png;base64,${application.screenshotBase64}`}
                alt="Filled application form"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
              />
            ) : null}
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => start(() => submitApplication(jobId).then(refresh))}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Submit application
              </button>
              {application?.sessionUrl ? (
                <a href={application.sessionUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:underline self-center">
                  Watch session ↗
                </a>
              ) : null}
            </div>
          </div>
        ) : status != null && RUNNING.has(status) ? (
          <p className="text-sm text-zinc-500">
            Applying… <span className="text-xs">({status})</span>
          </p>
        ) : (
          <div className="space-y-2">
            <button
              disabled={pending || !readiness?.hasResume || !readiness?.hasProfile}
              onClick={() => start(() => startApplication(jobId, 'fill').then(refresh))}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Apply with Jobby
            </button>
            {status === 'failed' && application?.error ? (
              <p className="text-xs text-red-600">{application.error}</p>
            ) : null}
            {readiness && !readiness.agentConfigured ? (
              <p className="text-xs text-zinc-400">
                Fills the {atsLabel(ats)} form and pauses for your review before submitting.
                (Agent keys not yet configured.)
              </p>
            ) : (
              <p className="text-xs text-zinc-400">
                Fills the {atsLabel(ats)} form and pauses for your review before submitting.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
