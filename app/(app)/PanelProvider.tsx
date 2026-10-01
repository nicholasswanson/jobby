'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import JobDetailPanel from './JobDetailPanel'

const PARAM = 'job'

type PanelCtx = { jobId: number | null; openJob: (id: number) => void; close: () => void }

const Ctx = createContext<PanelCtx>({ jobId: null, openJob: () => {}, close: () => {} })
export const usePanel = () => useContext(Ctx)

/**
 * Holds the open job-detail panel for the whole authenticated area. The open job
 * lives in the URL (`?job=123`) via the native History API, which Next's router
 * syncs into useSearchParams without a server round-trip — so opening is
 * instant, refresh keeps the panel, the link is shareable, and the browser's
 * Back button closes it (what a full-screen panel on a phone should do).
 *
 * Desktop: the panel reserves the right half; the content column keeps its
 * exact width (max-w-2xl) and re-centers into the left half so cards don't
 * reflow. Small screens: the panel overlays.
 */
export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams()
  const raw = Number(params.get(PARAM))
  const jobId = Number.isFinite(raw) && raw > 0 ? raw : null
  const open = jobId != null
  // Did *we* push the history entry for the open panel? Then close = Back, so
  // the stack stays clean. Otherwise (landed on a shared ?job= link) we just
  // rewrite the URL in place.
  const pushed = useRef(false)

  useEffect(() => {
    if (!open) pushed.current = false // closed via Back / navigation
  }, [open])

  const openJob = (id: number) => {
    if (id === jobId) return
    const url = new URL(window.location.href)
    url.searchParams.set(PARAM, String(id))
    if (open) {
      window.history.replaceState(null, '', url) // card → card: no extra entry
    } else {
      window.history.pushState(null, '', url)
      pushed.current = true
    }
  }
  const close = () => {
    if (!open) return
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else {
      const url = new URL(window.location.href)
      url.searchParams.delete(PARAM)
      window.history.replaceState(null, '', url)
    }
  }

  return (
    <Ctx.Provider value={{ jobId, openJob, close }}>
      {/* Outer wrapper reserves the panel's half when open; the inner column keeps
          its fixed max-w-2xl width and just re-centers into the remaining space. */}
      <div className={`flex-1 transition-[padding] duration-200 ${open ? 'lg:pr-[50vw]' : ''}`}>
        <div className="mx-auto w-full max-w-2xl px-6 py-4">{children}</div>
      </div>
      <JobDetailPanel jobId={jobId} onClose={close} />
    </Ctx.Provider>
  )
}
