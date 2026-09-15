import { z } from 'zod'
import type { NormalizedPosting } from './types'

// Ashby posting API: https://api.ashbyhq.com/posting-api/job-board/{slug}
// Response shape (fields we rely on):
const AshbyJob = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  publishedDate: z.string().nullish(),
  jobUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  // Ashby's compensation block varies; a human-readable summary is exposed as
  // `compensationTierSummary` when the org publishes pay.
  compensation: z
    .object({ compensationTierSummary: z.string().nullish() })
    .nullish(),
  secondaryLocations: z
    .array(z.object({ location: z.string() }))
    .nullish(),
})

const AshbyResponse = z.object({ jobs: z.array(AshbyJob) })

function pickLocation(job: z.infer<typeof AshbyJob>): string | null {
  const parts: string[] = []
  if (job.location) parts.push(job.location)
  if (job.secondaryLocations) {
    for (const s of job.secondaryLocations) parts.push(s.location)
  }
  const joined = parts.join(', ')
  // If the org flags the role remote but gave no location text, surface that.
  if (!joined && job.isRemote) return 'Remote'
  return joined || null
}

export function normalizeAshby(raw: unknown): NormalizedPosting[] {
  const { jobs } = AshbyResponse.parse(raw)
  return jobs.map((j) => {
    const url = j.jobUrl ?? j.applyUrl
    if (!url) {
      throw new Error(`Ashby job ${j.id} has no jobUrl/applyUrl`)
    }
    return {
      externalId: j.id,
      title: j.title,
      location: pickLocation(j),
      salaryText: j.compensation?.compensationTierSummary ?? null,
      url,
      postedAt: j.publishedDate ? new Date(j.publishedDate) : null,
      companyName: null,
    }
  })
}
