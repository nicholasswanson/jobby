// Which ATS a posting URL points at. Only these three offer anonymous
// (no-account) hosted apply forms — the ones the apply agent supports in v1.
// Everything else (Workday, iCIMS, Taleo, unknown) → manual apply.
export type SupportedAts = 'greenhouse' | 'lever' | 'ashby'

export function detectAts(url: string | null | undefined): SupportedAts | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host.includes('greenhouse.io')) return 'greenhouse' // boards/job-boards.greenhouse.io
  if (host.includes('lever.co')) return 'lever' // jobs.lever.co
  if (host.includes('ashbyhq.com')) return 'ashby' // jobs.ashbyhq.com
  return null
}

export function atsLabel(ats: SupportedAts): string {
  return { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby' }[ats]
}
