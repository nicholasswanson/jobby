import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// Greenhouse boards API: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
// Response shape (only the fields we rely on):
const GreenhouseJob = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  updated_at: z.string().nullish(),
  content: z.string().nullish(), // HTML-encoded job description
  location: z.object({ name: z.string() }).nullish(),
  metadata: z
    .array(z.object({ name: z.string(), value: z.unknown() }))
    .nullish(),
})

const GreenhouseResponse = z.object({ jobs: z.array(GreenhouseJob) })

// Greenhouse rarely exposes salary, but some boards attach it as a metadata
// field named like "Salary"/"Compensation"/"Pay range".
const SALARY_META = /salary|compensation|pay\s*range|base\s*pay/i

function pickSalary(
  metadata: z.infer<typeof GreenhouseJob>['metadata'],
): string | null {
  if (!metadata) return null
  for (const m of metadata) {
    if (SALARY_META.test(m.name) && typeof m.value === 'string' && m.value.trim()) {
      return m.value.trim()
    }
  }
  return null
}

export function normalizeGreenhouse(raw: unknown): NormalizedPosting[] {
  const { jobs } = GreenhouseResponse.parse(raw)
  return jobs.map((j) => ({
    externalId: String(j.id),
    title: j.title,
    description: descriptionSnippet(j.content),
    location: j.location?.name ?? null,
    salaryText: pickSalary(j.metadata),
    url: j.absolute_url,
    postedAt: j.updated_at ? new Date(j.updated_at) : null,
    companyName: null,
  }))
}
