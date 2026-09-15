'use client'

import { useEffect, useState } from 'react'
import { REMOTE_BADGES, relativeDate } from '@/lib/format'
import type { RemoteType } from '@/lib/filters'
import { enrichCompanyDetail, loadJobDetail } from './actions'
import ApplySection from './ApplySection'

type Detail = Awaited<ReturnType<typeof loadJobDetail>>

export default function JobDetailPanel({
  jobId,
  onClose,
}: {
  jobId: number | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (jobId == null) return
    let active = true
    setLoading(true)
    setDetail(null)
    loadJobDetail(jobId).then((d) => {
      if (active) {
        setDetail(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [jobId])

  // Close on Escape.
  useEffect(() => {
    if (jobId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobId, onClose])

  // Enrich the company on open if it has no blurb yet (aggregator employers etc.).
  const [enriching, setEnriching] = useState(false)
  const companyId = detail?.company?.id
  const companySparse = detail?.company && !detail.company.oneLiner && !detail.company.description
  useEffect(() => {
    if (!companyId || !companySparse) return
    let active = true
    setEnriching(true)
    enrichCompanyDetail(companyId)
      .then((res) => {
        if (active && res) {
          setDetail((d) => (d && d.company ? { ...d, company: { ...d.company, ...res } } : d))
        }
      })
      .finally(() => active && setEnriching(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, companySparse])

  const open = jobId != null
  const badge = detail?.remoteType ? REMOTE_BADGES[detail.remoteType as RemoteType] : null
  const c = detail?.company

  return (
    <>
      {/* Scrim on mobile only — on desktop the panel pushes content instead. */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-black/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
      />
      {/* Drawer — pushes content on lg (see PanelProvider right padding). */}
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed right-0 top-0 z-30 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 lg:max-w-[27rem] dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm font-medium text-zinc-500">Job details</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading || !detail ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">{c?.name}</p>
              <div className="mt-0.5 flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-snug">{detail.title}</h2>
                {badge ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                {detail.location ? <span>{detail.location}</span> : null}
                {detail.salaryText ? <span>· {detail.salaryText}</span> : null}
                {detail.postedAt ? <span>· posted {relativeDate(detail.postedAt)} ago</span> : null}
              </div>

              {/* Résumé tailoring + one-click apply (View + Open-and-pre-fill live here) */}
              <ApplySection jobId={detail.id} applyUrl={detail.url} />

              {/* Company breakdown */}
              {c ? (
                <section className="mt-5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold">About {c.name}</h3>
                  {c.oneLiner ? (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{c.oneLiner}</p>
                  ) : enriching ? (
                    <p className="mt-1 text-sm text-zinc-400">Researching company…</p>
                  ) : null}
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {c.teamSize ? <Row k="Team size" v={`${c.teamSize}`} /> : null}
                    {c.industry ? <Row k="Industry" v={c.industry} /> : null}
                    {c.batch ? <Row k="YC batch" v={c.batch} /> : null}
                    {c.stage ? <Row k="Stage" v={c.stage} /> : null}
                    <Row k="Source" v={c.atsType} />
                  </dl>
                  {c.website ? (
                    <a
                      href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-sky-600 hover:underline dark:text-sky-400"
                    >
                      {c.website.replace(/^https?:\/\//, '')} ↗
                    </a>
                  ) : null}
                  {c.description ? (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">{c.description}</p>
                  ) : null}
                </section>
              ) : null}

              {/* Full job description */}
              <section className="mt-5">
                <h3 className="text-sm font-semibold">Description</h3>
                {detail.description ? (
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {detail.description}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-zinc-400">
                    No description captured — open the posting to read it.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-zinc-400">{k}</dt>
      <dd className="text-zinc-700 dark:text-zinc-300">{v}</dd>
    </>
  )
}
