/**
 * Seed list builder (technical_plan.md § Seed list builder).
 *
 * Sources the YC company directory (via the maintained, key-free yc-oss public
 * mirror — same YC data as the Algolia index the site uses, but stable and
 * re-runnable without rotating credentials), filters to recent AI/ML batches,
 * generates ATS slug candidates from each company's name + domain, and probes
 * Greenhouse / Lever / Ashby. A 200 with a parseable jobs array locks in the
 * (ats_type, slug) pair. Misses are written to seed-misses.csv for a manual pass.
 *
 *   npm run seed              # full candidate list
 *   npm run seed -- --limit 50   # sample run
 */
import { writeFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { buildBoardUrl, politeFetch, type BoardAtsType } from '../lib/sources'
import { upsertSeedCompany } from '../lib/db/queries'
import { truncate } from '../lib/text'

type YcCompany = {
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

function slugCandidates(c: YcCompany): string[] {
  const cleaned = c.name.toLowerCase().replace(/&/g, ' and ')
  const compact = cleaned.replace(/[^a-z0-9]+/g, '')
  const hyphen = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const stem = domainStem(c.website)
  const noAi = compact.replace(/ai$/, '')

  // Tightest, highest-yield candidates first (domain stem and compact name win
  // most hits); a couple of common variants after. Kept short to bound probes.
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
    // A valid board is 200 + a parseable jobs array (even if currently empty —
    // all three providers 404 on unknown slugs, so an empty array is a real
    // board with no open roles, not a false positive).
    if (ats === 'lever') return Array.isArray(data)
    // greenhouse / ashby
    return Array.isArray((data as { jobs?: unknown }).jobs)
  } catch {
    return false
  }
}

async function detectAts(
  candidates: string[],
): Promise<{ atsType: BoardAtsType; slug: string } | null> {
  for (const slug of candidates) {
    for (const ats of ATS_ORDER) {
      if (await isValidBoard(ats, slug)) return { atsType: ats, slug }
    }
  }
  return null
}

async function fetchCandidates(): Promise<YcCompany[]> {
  const seen = new Map<string, YcCompany>()
  for (const url of YC_TAG_URLS) {
    const res = await politeFetch(url, { timeoutMs: 15_000 })
    const list = (await res.json()) as YcCompany[]
    for (const c of list) seen.set(c.slug, c)
  }
  const all = [...seen.values()]
  // Probe all Active AI/ML companies. Recent-batch, actively-hiring companies
  // are probed first (highest board-detection yield); older Active companies
  // follow to reach the seed-count the pipeline needs.
  const filtered = all.filter((c) => c.status === 'Active')
  const score = (c: YcCompany) =>
    Number(Boolean(c.isHiring)) * 2 + (isRecentBatch(c.batch) ? 1 : 0)
  filtered.sort((a, b) => score(b) - score(a))
  return filtered
}

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const cap = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

  console.log('Fetching YC AI/ML company directory (yc-oss)…')
  let candidates = await fetchCandidates()
  if (Number.isFinite(cap)) candidates = candidates.slice(0, cap)
  console.log(`Probing ${candidates.length} companies across 3 ATS providers…`)

  const limit = pLimit(PROBE_CONCURRENCY)
  let hits = 0
  let inserted = 0
  const misses: YcCompany[] = []
  let done = 0

  await Promise.all(
    candidates.map((c) =>
      limit(async () => {
        const detected = await detectAts(slugCandidates(c))
        done += 1
        if (done % 50 === 0) console.log(`  …${done}/${candidates.length} (${hits} hits)`)
        if (!detected) {
          misses.push(c)
          return
        }
        hits += 1
        const { isNew } = await upsertSeedCompany({
          name: c.name,
          atsType: detected.atsType,
          slug: detected.slug,
          website: c.website ?? null,
          source: 'yc',
          // Enrichment straight from the YC directory (public, no scraping).
          oneLiner: c.one_liner ?? null,
          description: c.long_description ? truncate(c.long_description, 1200) : null,
          teamSize: c.team_size ?? null,
          industry: c.industry ?? null,
          batch: c.batch ?? null,
          stage: c.stage ?? null,
        })
        if (isNew) inserted += 1
      }),
    ),
  )

  // Misses → CSV for a manual pass.
  const csv = [
    'name,website,batch,tried_slugs',
    ...misses.map(
      (c) =>
        `"${c.name.replace(/"/g, '""')}",${c.website ?? ''},${c.batch ?? ''},"${slugCandidates(c).join(' ')}"`,
    ),
  ].join('\n')
  writeFileSync('seed-misses.csv', csv)

  const rate = candidates.length ? ((hits / candidates.length) * 100).toFixed(1) : '0'
  console.log('\n===== Seed summary =====')
  console.log(`Companies probed : ${candidates.length}`)
  console.log(`ATS detected     : ${hits} (${rate}%)`)
  console.log(`Newly inserted   : ${inserted}`)
  console.log(`Misses           : ${misses.length} -> seed-misses.csv`)
  console.log('Validation gate  : target >=60% detection and >=150 active companies')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
