'use client'

import { createContext, useContext, useState } from 'react'
import JobDetailPanel from './JobDetailPanel'

type PanelCtx = { jobId: number | null; openJob: (id: number) => void; close: () => void }

const Ctx = createContext<PanelCtx>({ jobId: null, openJob: () => {}, close: () => {} })
export const usePanel = () => useContext(Ctx)

/**
 * Holds the open job-detail panel for the whole authenticated area. When open on
 * desktop the content column shrinks (right padding) so the panel pushes it aside
 * rather than covering it — Erin can keep clicking listings to refresh the panel.
 * On small screens the panel overlays (no room to push).
 */
export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const [jobId, setJobId] = useState<number | null>(null)
  const open = jobId != null

  return (
    <Ctx.Provider value={{ jobId, openJob: setJobId, close: () => setJobId(null) }}>
      <div
        className={`mx-auto w-full max-w-2xl flex-1 px-4 py-4 transition-[max-width,padding] duration-200 ${
          open ? 'lg:max-w-6xl lg:pr-[27rem]' : ''
        }`}
      >
        {children}
      </div>
      <JobDetailPanel jobId={jobId} onClose={() => setJobId(null)} />
    </Ctx.Provider>
  )
}
