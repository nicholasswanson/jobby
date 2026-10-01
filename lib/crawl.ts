import pLimit from 'p-limit'
import { filterJob, SEARCH_PROFILES, type FilterResult, type SearchProfile } from './filters'
import { dedupeHash } from './hash'
import { isOvernightPacific } from './time'
import {
  AGGREGATORS,
  buildBoardUrl,
  fetchJson,
  fetchText,
  normalizeBoard,
  type BoardAtsType,
} from './sources'
import {
  closeMissingJobs,
  getActiveBoardCompanies,
  getKnownCompanyNames,
  getLastSeedAt,
  getOrCreateAggregatorCompany,
  markCompanyEnriched,
  recordCompanyFailure,
  recordRun,
  resetCompanyFailures,
  upsertJob,
  upsertJobs,
} from './db/queries'
import type { NewJob } from './db/schema'
import { fetchSiteDescription } from './enrich'
import { discoverNewCompanies } from './seed'
import type { NormalizedPosting } from './sources/types'
import type { Company } from './db/schema'

const CONCURRENCY = 8

// Occasional auto-seed: refresh the company list at most once per this window,
// probing a bounded number of not-yet-known YC companies so it fits the crawl's
// time budget. `npm run seed` still does the full, unbounded pass.
const SEED_INTERVAL_MS = 20 * 60 * 60 * 1000 // ~once a day
const SEED_MAX_PROBE = 40

/** Discover a few new seed companies if we haven't seeded recently. Best-effort. */
async function maybeSeed(now: Date): Promise<Date | null> {
  const last = await getLastSeedAt()
  if (last && now.getTime() - last.getTime() < SEED_INTERVAL_MS) return null
  try {
    const knownNames = await getKnownCompanyNames()
    await discoverNewCompanies({ knownNames, maxProbe: SEED_MAX_PROBE })
  } catch {
    /* seeding is best-effort; never fail a crawl over it */
  }
  return new Date()
}

export type CrawlResult = {
  skipped?: 'overnight'
  runId?: number
  companiesOk: number
  companiesFailed: number
  jobsSeen: number
  newJobs: number
}

type Counters = { jobsSeen: number; newJobs: number; filtered: number; seenJobIds: number[] }

// Every person's search runs against every posting; a posting yields one job
// row per profile it is relevant to (see SEARCH_PROFILES in lib/filters.ts).
const PROFILES: SearchProfile[] = Object.values(SEARCH_PROFILES)

type RelevantVerdict = Extract<FilterResult, { relevant: true } | { included: true }>

/** (profile, verdict) pairs for the profiles this posting is a target role for. */
function verdictsFor(p: NormalizedPosting): { profile: SearchProfile; verdict: RelevantVerdict }[] {
  const out: { profile: SearchProfile; verdict: RelevantVerdict }[] = []
  for (const profile of PROFILES) {
    const verdict = filterJob(
      { title: p.title, location: p.location, description: p.description },
      profile,
    )
    if (verdict.included || verdict.relevant) out.push({ profile, verdict })
  }
  return out
}

// Build a job row from a posting + its (non-irrelevant) verdict for one profile.
function buildRow(
  companyId: number,
  profile: SearchProfile,
  p: NormalizedPosting,
  verdict: RelevantVerdict,
): NewJob {
  const included = verdict.included
  return {
    companyId,
    profile: profile.key,
    externalId: p.externalId,
    dedupeHash: dedupeHash(companyId, p.title, p.location),
    title: p.title,
    description: p.description,
    categories: verdict.categories,
    location: p.location,
    remoteType: included ? verdict.remoteType : null,
    salaryText: p.salaryText,
    url: p.url,
    postedAt: p.postedAt,
    status: included ? 'inbox' : 'filtered',
    filterReason: included ? null : verdict.reason,
  }
}

/**
 * Ingest one posting for a known company (used by aggregators, which resolve a
 * distinct company per posting so batching doesn't apply). Per profile:
 *  - target role, passes gates  → `inbox`
 *  - target role, gated out      → `filtered` (+ reason) for review
 *  - not a target role           → skipped
 */
async function ingestOne(companyId: number, p: NormalizedPosting, counters: Counters) {
  for (const { profile, verdict } of verdictsFor(p)) {
    const { job, isNew } = await upsertJob(buildRow(companyId, profile, p, verdict))
    counters.seenJobIds.push(job.id)
    if (verdict.included) {
      counters.jobsSeen += 1
      if (isNew) counters.newJobs += 1
    } else if (isNew) {
      counters.filtered += 1
    }
  }
}

/** Board ingest: classify all postings (per profile), then upsert in a single batch per company. */
async function ingestPostings(companyId: number, postings: NormalizedPosting[], counters: Counters) {
  const rows: NewJob[] = []
  const includedFlags: boolean[] = []
  const seenKeys = new Set<string>()
  for (const p of postings) {
    for (const { profile, verdict } of verdictsFor(p)) {
      const row = buildRow(companyId, profile, p, verdict)
      // ON CONFLICT can't hit the same (hash, profile) twice in one batch.
      const key = `${row.dedupeHash}|${row.profile}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      rows.push(row)
      includedFlags.push(verdict.included)
    }
  }
  const result = await upsertJobs(rows)
  result.forEach((r, i) => {
    counters.seenJobIds.push(r.id)
    if (includedFlags[i]) {
      counters.jobsSeen += 1
      if (r.isNew) counters.newJobs += 1
    } else if (r.isNew) {
      counters.filtered += 1
    }
  })
}

async function crawlBoardCompany(company: Company, counters: Counters): Promise<boolean> {
  if (!company.slug) return false
  const url = buildBoardUrl(company.atsType as BoardAtsType, company.slug)
  const raw = await fetchJson(url)
  const postings = normalizeBoard(company.atsType as BoardAtsType, raw)
  await ingestPostings(company.id, postings, counters)
  return true
}

async function crawlAggregators(counters: Counters) {
  for (const agg of AGGREGATORS) {
    try {
      const raw = agg.kind === 'json' ? await fetchJson(agg.url) : await fetchText(agg.url)
      const postings = agg.normalize(raw)
      for (const p of postings) {
        // Skip roles irrelevant to everyone before creating a company row for them.
        if (verdictsFor(p).length === 0) continue
        const name = p.companyName?.trim()
        if (!name) continue

        const company = await getOrCreateAggregatorCompany(name, agg.key)
        if (!company || !company.active) continue

        await ingestOne(company.id, p, counters)
      }
    } catch (err) {
      // Aggregator feed failure is isolated — it never fails the run.
      console.error(`[crawl] aggregator ${agg.key} failed:`, err instanceof Error ? err.message : err)
    }
  }
}

/**
 * The full crawl pipeline (technical_plan.md § Crawl pipeline). Idempotent:
 * running twice back-to-back inserts nothing the second time.
 *
 * @param opts.now   Override the clock (used by tests / the overnight gate).
 * @param opts.force Skip the overnight gate (manual / workflow_dispatch runs).
 */
export async function runCrawl(opts: { now?: Date; force?: boolean } = {}): Promise<CrawlResult> {
  const now = opts.now ?? new Date()

  if (!opts.force && isOvernightPacific(now)) {
    const run = await recordRun({
      startedAt: now,
      finishedAt: now,
      companiesOk: 0,
      companiesFailed: 0,
      jobsSeen: 0,
      newJobs: 0,
      skipped: true,
      errorSummary: null,
    })
    return { skipped: 'overnight', runId: run?.id, companiesOk: 0, companiesFailed: 0, jobsSeen: 0, newJobs: 0 }
  }

  const startedAt = now
  const counters: Counters = { jobsSeen: 0, newJobs: 0, filtered: 0, seenJobIds: [] }
  const companies = await getActiveBoardCompanies()

  let companiesOk = 0
  let companiesFailed = 0
  const okCompanyIds: number[] = []
  const errors: string[] = []

  const limit = pLimit(CONCURRENCY)
  await Promise.all(
    companies.map((company) =>
      limit(async () => {
        try {
          await crawlBoardCompany(company, counters)
          await resetCompanyFailures(company.id)
          companiesOk += 1
          okCompanyIds.push(company.id)

          // Enrich companies the YC seed didn't cover (own-site meta only).
          // Isolated so enrichment never affects crawl success.
          if (!company.enrichedAt && company.website) {
            try {
              const desc = await fetchSiteDescription(company.website)
              await markCompanyEnriched(company.id, desc)
            } catch {
              /* enrichment is best-effort */
            }
          }
        } catch (err) {
          companiesFailed += 1
          await recordCompanyFailure(company.id)
          if (errors.length < 20) {
            errors.push(`${company.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }),
    ),
  )

  // Close jobs that vanished from successfully-crawled boards (interested carve-out
  // handled inside closeMissingJobs).
  await closeMissingJobs(okCompanyIds, counters.seenJobIds)

  // Supplemental aggregator feeds (own failure isolation; no close-missing in v1).
  await crawlAggregators(counters)

  // Occasionally refresh the seed list (discover new YC companies). Gated to
  // ~once/day and bounded, so it rides along with the crawl without slowing it.
  const seededAt = await maybeSeed(now)

  const run = await recordRun({
    startedAt,
    finishedAt: new Date(),
    companiesOk,
    companiesFailed,
    jobsSeen: counters.jobsSeen,
    newJobs: counters.newJobs,
    skipped: false,
    errorSummary: errors.length ? errors.join('\n') : null,
    seededAt,
  })

  return {
    runId: run?.id,
    companiesOk,
    companiesFailed,
    jobsSeen: counters.jobsSeen,
    newJobs: counters.newJobs,
  }
}
