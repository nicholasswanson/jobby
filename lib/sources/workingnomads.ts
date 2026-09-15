import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// Working Nomads public API: https://www.workingnomads.com/api/exposed_jobs/
// JSON array of remote jobs across categories. Aggregator.
const WnJob = z.object({
  url: z.string(),
  title: z.string(),
  company_name: z.string(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  pub_date: z.string().nullish(),
})

const WnResponse = z.array(WnJob)

export function normalizeWorkingNomads(raw: unknown): NormalizedPosting[] {
  const jobs = WnResponse.parse(raw)
  return jobs.map((j) => ({
    externalId: j.url,
    title: j.title,
    description: descriptionSnippet(j.description),
    location: j.location?.trim() || 'Remote',
    salaryText: null,
    url: j.url,
    postedAt: j.pub_date ? new Date(j.pub_date) : null,
    companyName: j.company_name,
  }))
}
