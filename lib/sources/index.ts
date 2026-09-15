import { normalizeGreenhouse } from './greenhouse'
import { normalizeLever } from './lever'
import { normalizeAshby } from './ashby'
import { normalizeRemotive } from './remotive'
import { normalizeWwr } from './wwr'
import type { NormalizedPosting } from './types'

export type BoardAtsType = 'greenhouse' | 'lever' | 'ashby'

export const REQUEST_TIMEOUT_MS = 10_000

/** Build the public board URL for a per-company ATS source. */
export function buildBoardUrl(atsType: BoardAtsType, slug: string): string {
  switch (atsType) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
    case 'lever':
      return `https://api.lever.co/v0/postings/${slug}?mode=json`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  }
}

export function normalizeBoard(atsType: BoardAtsType, raw: unknown): NormalizedPosting[] {
  switch (atsType) {
    case 'greenhouse':
      return normalizeGreenhouse(raw)
    case 'lever':
      return normalizeLever(raw)
    case 'ashby':
      return normalizeAshby(raw)
  }
}

export type Aggregator = {
  key: 'remotive' | 'wwr'
  label: string
  url: string
  kind: 'json' | 'text'
  normalize: (raw: unknown) => NormalizedPosting[]
}

export const AGGREGATORS: Aggregator[] = [
  {
    key: 'remotive',
    label: 'Remotive',
    url: 'https://remotive.com/api/remote-jobs?category=sales',
    kind: 'json',
    normalize: (raw) => normalizeRemotive(raw),
  },
  {
    key: 'wwr',
    label: 'We Work Remotely',
    url: 'https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss',
    kind: 'text',
    normalize: (raw) => normalizeWwr(raw as string),
  },
]

class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`)
  }
}

async function fetchOnce(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'jobscout/1.0 (+https://github.com/nicholasswanson/jobby)' },
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch a URL with a timeout and a single backoff retry on HTTP 429.
 * Politeness: technical_plan.md § Crawl pipeline (10s timeout, backoff on 429).
 */
export async function politeFetch(
  url: string,
  { timeoutMs = REQUEST_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Response> {
  let res = await fetchOnce(url, timeoutMs)
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 2
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000))
    res = await fetchOnce(url, timeoutMs)
  }
  if (!res.ok) throw new HttpError(res.status, url)
  return res
}

export async function fetchJson(url: string, opts?: { timeoutMs?: number }): Promise<unknown> {
  const res = await politeFetch(url, opts)
  return res.json()
}

export async function fetchText(url: string, opts?: { timeoutMs?: number }): Promise<string> {
  const res = await politeFetch(url, opts)
  return res.text()
}
