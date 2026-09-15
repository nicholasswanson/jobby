/**
 * Seed-list discovery (shared by the CLI `npm run seed` and the crawl's
 * occasional auto-seed). Sources the YC company directory (key-free yc-oss
 * mirror), filters to recent AI/ML batches, generates ATS slug candidates and
 * probes Greenhouse / Lever / Ashby. A 200 with a parseable jobs array locks in
 * the (ats_type, slug) pair.
 *
 * No LinkedIn/Indeed/Glassdoor (AGENTS.md hard rule #1) — only the public YC
 * directory + the documented ATS endpoints.
 */
import pLimit from 'p-limit'
import { buildBoardUrl, politeFetch, type BoardAtsType } from './sources'
import { upsertSeedCompany } from './db/queries'
import { truncate } from './text'

export type YcCompany = {
  name: string
  slug: string
  website?: string | null
  all_locations?: string | null
  batch?: string | null
  status?: string | null
  isHiring?: boolean
  tags?: string[]
  one_liner?: string | null
  long_description?: string | null
  team_size?: number | null
  industry?: string | null
  stage?: string | null
}

const YC_TAG_URLS = [
  'https://yc-oss.github.io/api/tags/artificial-intelligence.json',
  'https://yc-oss.github.io/api/tags/machine-learning.json',
]

const PROBE_CONCURRENCY = 5 // politeness: <=5 concurrent probes
// AI startups skew toward Ashby/Greenhouse; probe those first to hit sooner.
const ATS_ORDER: BoardAtsType[] = ['ashby', 'greenhouse', 'lever']

function isRecentBatch(batch?: string | null): boolean {
  if (!batch) return false
  return /20(2[2-9])/.test(batch) // 2022 or later
}

function domainStem(website?: string | null): string | null {
  if (!website) return null
  try {
    const host = new URL(website.startsWith('http') ? website : `https://${website}`).hostname
    return host.replace(/^www\./, '').split('.')[0].toLowerCase()
  } catch {
    return null
  }
}

export function slugCandidates(c: YcCompany): string[] {
  const cleaned = c.name.toLowerCase().replace(/&/g, ' and ')
  const compact = cleaned.replace(/[^a-z0-9]+/g, '')
  const hyphen = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const stem = domainStem(c.website)
  const noAi = compact.replace(/ai$/, '')

  const out = new Set<string>()
  for (const s of [stem, compact, noAi, `${compact}ai`, hyphen]) {
    if (s && s.length >= 2) out.add(s)
  }
  return [...out]
}

async function isValidBoard(ats: BoardAtsType, slug: string): Promise<boolean> {
  try {
    const res = await politeFetch(buildBoardUrl(ats, slug), { timeoutMs: 10_000 })
    const data = await res.json()
    if (ats === 'lever') return Array.isArray(data)
    return Array.isArray((data as { jobs?: unknown }).jobs)
  } catch {
    return false
  }
}

export async function detectAts(
  candidates: string[],
): Promise<{ atsType: BoardAtsType; slug: string } | null> {
  for (const slug of candidates) {
    for (const ats of ATS_ORDER) {
      if (await isValidBoard(ats, slug)) return { atsType: ats, slug }
    }
  }
  return null
}

/** Active AI/ML YC companies, highest board-detection yield first. */
export async function fetchCandidates(): Promise<YcCompany[]> {
  const seen = new Map<string, YcCompany>()
  for (const url of YC_TAG_URLS) {
    const res = await politeFetch(url, { timeoutMs: 15_000 })
    const list = (await res.json()) as YcCompany[]
    for (const c of list) seen.set(c.slug, c)
  }
  const filtered = [...seen.values()].filter((c) => c.status === 'Active')
  const score = (c: YcCompany) => Number(Boolean(c.isHiring)) * 2 + (isRecentBatch(c.batch) ? 1 : 0)
  filtered.sort((a, b) => score(b) - score(a))
  return filtered
}

async function upsertHit(c: YcCompany, detected: { atsType: BoardAtsType; slug: string }) {
  return upsertSeedCompany({
    name: c.name,
    atsType: detected.atsType,
    slug: detected.slug,
    website: c.website ?? null,
    source: 'yc',
    oneLiner: c.one_liner ?? null,
    description: c.long_description ? truncate(c.long_description, 1200) : null,
    teamSize: c.team_size ?? null,
    industry: c.industry ?? null,
    batch: c.batch ?? null,
    stage: c.stage ?? null,
  })
}

export type SeedResult = { probed: number; hits: number; inserted: number; misses: YcCompany[] }

/**
 * Probe a list of candidates and upsert every detected board.
 * Returns hits + the misses (the CLI writes those to a CSV).
 */
export async function probeCandidates(candidates: YcCompany[]): Promise<SeedResult> {
  const limit = pLimit(PROBE_CONCURRENCY)
  let hits = 0
  let inserted = 0
  const misses: YcCompany[] = []

  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const detected = await detectAts(slugCandidates(c))
        if (!detected) {
          misses.push(c)
          return
        }
        hits += 1
        const { isNew } = await upsertHit(c, detected)
        if (isNew) inserted += 1
      }),
    ),
  )

  return { probed: candidates.length, hits, inserted, misses }
}

/**
 * Incremental discovery for the crawl's occasional auto-seed. Fetches the YC
 * directory, drops companies we already have (by name), and probes at most
 * `maxProbe` of the remaining top-scored candidates — bounded so it fits inside
 * the crawl's time budget. New actively-hiring companies sort to the top, so
 * they get discovered quickly.
 */
export async function discoverNewCompanies(opts: {
  knownNames: Set<string>
  maxProbe: number
}): Promise<SeedResult> {
  const all = await fetchCandidates()
  const fresh = all.filter((c) => !opts.knownNames.has(c.name.trim().toLowerCase()))
  return probeCandidates(fresh.slice(0, opts.maxProbe))
}
