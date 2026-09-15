import { z } from 'zod'
import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// Lever postings API: https://api.lever.co/v0/postings/{slug}?mode=json
// Response is a top-level array of postings.
const LeverPosting = z.object({
  id: z.string(),
  text: z.string(), // the job title
  hostedUrl: z.string(),
  applyUrl: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  description: z.string().nullish(), // HTML fallback
  createdAt: z.number().nullish(), // epoch milliseconds
  categories: z
    .object({
      location: z.string().nullish(),
      commitment: z.string().nullish(),
      team: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
})

const LeverResponse = z.array(LeverPosting)

function formatSalary(
  range: z.infer<typeof LeverPosting>['salaryRange'],
): string | null {
  if (!range || range.min == null || range.max == null) return null
  const currency = range.currency ?? 'USD'
  const interval = range.interval ? ` / ${range.interval.replace(/-/g, ' ')}` : ''
  const fmt = (n: number) => n.toLocaleString('en-US')
  return `${currency} ${fmt(range.min)}–${fmt(range.max)}${interval}`
}

function pickLocation(
  categories: z.infer<typeof LeverPosting>['categories'],
): string | null {
  if (!categories) return null
  if (categories.location) return categories.location
  if (categories.allLocations && categories.allLocations.length > 0) {
    return categories.allLocations.join(', ')
  }
  return null
}

export function normalizeLever(raw: unknown): NormalizedPosting[] {
  const postings = LeverResponse.parse(raw)
  return postings.map((p) => ({
    externalId: p.id,
    title: p.text,
    description: descriptionSnippet(p.descriptionPlain ?? p.description),
    location: pickLocation(p.categories),
    salaryText: formatSalary(p.salaryRange),
    url: p.hostedUrl,
    postedAt: p.createdAt != null ? new Date(p.createdAt) : null,
    companyName: null,
  }))
}
