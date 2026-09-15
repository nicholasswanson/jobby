'use client'

import { createContext, useContext, useState } from 'react'
import JobDetailPanel from './JobDetailPanel'

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

  return (
    <Ctx.Provider value={{ jobId, openJob: setJobId, close: () => setJobId(null) }}>
      <div
        className={`mx-auto w-full max-w-2xl flex-1 px-6 py-4 transition-[padding] duration-200 ${
          open ? 'lg:pr-[50vw]' : ''
        }`}
      >
        {children}
      </div>
      <JobDetailPanel jobId={jobId} onClose={() => setJobId(null)} />
    </Ctx.Provider>
  )
}
