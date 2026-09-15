'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import JobDetailPanel from './JobDetailPanel'

const STORE_KEY = 'jobby.panel'

type PanelCtx = { jobId: number | null; openJob: (id: number) => void; close: () => void }

const Ctx = createContext<PanelCtx>({ jobId: null, openJob: () => {}, close: () => {} })
export const usePanel = () => useContext(Ctx)

/**
 * Holds the open job-detail panel for the whole authenticated area. When open on
 * desktop the panel reserves the right half; the content column keeps its exact
 * width (max-w-2xl) and just re-centers into the left half so the cards don't
 * reflow — the panel occupies space rather than resizing the cards. Erin can keep
 * clicking listings to refresh the panel. On small screens the panel overlays.
 */
export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const [jobId, setJobId] = useState<number | null>(null)
  const open = jobId != null

  // Keep the open job across refreshes.
  useEffect(() => {
    const saved = Number(localStorage.getItem(STORE_KEY))
    if (Number.isFinite(saved) && saved > 0) setJobId(saved)
  }, [])
  const openJob = (id: number) => {
    setJobId(id)
    localStorage.setItem(STORE_KEY, String(id))
  }
  const close = () => {
    setJobId(null)
    localStorage.removeItem(STORE_KEY)
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
