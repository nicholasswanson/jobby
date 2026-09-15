import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// Himalayas public API: https://himalayas.app/jobs/api — JSON array of remote
// jobs. Aggregator.
const HimJob = z.object({
  title: z.string(),
  companyName: z.string(),
  applicationLink: z.string(),
  guid: z.union([z.string(), z.number()]).nullish(),
  locationRestrictions: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  excerpt: z.string().nullish(),
  pubDate: z.union([z.number(), z.string()]).nullish(),
  minSalary: z.number().nullish(),
  maxSalary: z.number().nullish(),
})

const HimResponse = z.union([z.array(HimJob), z.object({ jobs: z.array(HimJob) })])

function salary(min?: number | null, max?: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  return fmt((min || max)!)
}

function toDate(v: number | string | null | undefined): Date | null {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v) // epoch s or ms
  return new Date(v)
}

export function normalizeHimalayas(raw: unknown): NormalizedPosting[] {
  const parsed = HimResponse.parse(raw)
  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs
  return jobs.map((j) => ({
    externalId: j.guid != null ? String(j.guid) : j.applicationLink,
    title: j.title,
    description: descriptionSnippet(j.description ?? j.excerpt),
    location: j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Remote',
    salaryText: salary(j.minSalary, j.maxSalary),
    url: j.applicationLink,
    postedAt: toDate(j.pubDate),
    companyName: j.companyName,
  }))
}
