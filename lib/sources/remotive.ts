import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// Remotive public API: https://remotive.com/api/remote-jobs?category=sales
// Aggregator — every listing is remote by definition and carries its own
// company name.
const RemotiveJob = z.object({
  id: z.number(),
  url: z.string(),
  title: z.string(),
  company_name: z.string(),
  candidate_required_location: z.string().nullish(),
  salary: z.string().nullish(),
  description: z.string().nullish(), // HTML
  publication_date: z.string().nullish(),
})

const RemotiveResponse = z.object({ jobs: z.array(RemotiveJob) })

export function normalizeRemotive(raw: unknown): NormalizedPosting[] {
  const { jobs } = RemotiveResponse.parse(raw)
  return jobs.map((j) => ({
    externalId: String(j.id),
    title: j.title,
    description: descriptionSnippet(j.description),
    // Remotive is remote-only; if no restriction is given, treat as fully remote.
    location: j.candidate_required_location?.trim()
      ? j.candidate_required_location.trim()
      : 'Remote',
    salaryText: j.salary?.trim() ? j.salary.trim() : null,
    url: j.url,
    postedAt: j.publication_date ? new Date(j.publication_date) : null,
    companyName: j.company_name,
  }))
}
