import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// RemoteOK public API: https://remoteok.com/api — a JSON array whose first
// element is a legal notice (no `position`); the rest are jobs. Aggregator.
const RemoteOkJob = z.object({
  id: z.union([z.string(), z.number()]),
  company: z.string(),
  position: z.string(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  url: z.string().nullish(),
  apply_url: z.string().nullish(),
  date: z.string().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
})

function salary(min?: number | null, max?: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  return fmt((min || max)!)
}

export function normalizeRemoteOK(raw: unknown): NormalizedPosting[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedPosting[] = []
  for (const item of raw) {
    const parsed = RemoteOkJob.safeParse(item)
    if (!parsed.success) continue // skips the legal-notice element + malformed rows
    const j = parsed.data
    out.push({
      externalId: String(j.id),
      title: j.position,
      description: descriptionSnippet(j.description),
      location: j.location?.trim() || 'Remote',
      salaryText: salary(j.salary_min, j.salary_max),
      url: j.apply_url || j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      postedAt: j.date ? new Date(j.date) : null,
      companyName: j.company,
    })
  }
  return out
}
