import pLimit from 'p-limit'
import { filterJob } from './filters'
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
import type { NormalizedPosting } from './sources/types'
import type { Company } from './db/schema'

const CONCURRENCY = 8

export type CrawlResult = {
  skipped?: 'overnight'
  runId?: number
  companiesOk: number
  companiesFailed: number
  jobsSeen: number
  newJobs: number
}

type Counters = { jobsSeen: number; newJobs: number; filtered: number; seenJobIds: number[] }

// Build a job row from a posting + its (non-irrelevant) verdict.
function buildRow(
  companyId: number,
  p: NormalizedPosting,
  verdict: Extract<ReturnType<typeof filterJob>, { relevant: true } | { included: true }>,
): NewJob {
  const included = verdict.included
  return {
    companyId,
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
 * distinct company per posting so batching doesn't apply).
 *  - target role, passes gates  → `inbox`
 *  - target role, gated out      → `filtered` (+ reason) for review
 *  - not a target role           → skipped
 */
async function ingestOne(companyId: number, p: NormalizedPosting, counters: Counters) {
  const verdict = filterJob({ title: p.title, location: p.location, description: p.description })
  if (!verdict.included && !verdict.relevant) return
  const { job, isNew } = await upsertJob(buildRow(companyId, p, verdict))
  counters.seenJobIds.push(job.id)
  if (verdict.included) {
    counters.jobsSeen += 1
    if (isNew) counters.newJobs += 1
  } else if (isNew) {
    counters.filtered += 1
  }
}

/** Board ingest: classify all postings, then upsert in a single batch per company. */
async function ingestPostings(companyId: number, postings: NormalizedPosting[], counters: Counters) {
  const rows: NewJob[] = []
  const includedFlags: boolean[] = []
  const seenHashes = new Set<string>()
  for (const p of postings) {
    const verdict = filterJob({ title: p.title, location: p.location, description: p.description })
    if (!verdict.included && !verdict.relevant) continue
    const row = buildRow(companyId, p, verdict)
    if (seenHashes.has(row.dedupeHash)) continue // ON CONFLICT can't hit a hash twice per batch
    seenHashes.add(row.dedupeHash)
    rows.push(row)
    includedFlags.push(verdict.included)
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
        // Skip irrelevant roles before creating a company row for them.
        const verdict = filterJob({ title: p.title, location: p.location, description: p.description })
        if (!verdict.included && !verdict.relevant) continue
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

  const run = await recordRun({
    startedAt,
    finishedAt: new Date(),
    companiesOk,
    companiesFailed,
    jobsSeen: counters.jobsSeen,
    newJobs: counters.newJobs,
    skipped: false,
    errorSummary: errors.length ? errors.join('\n') : null,
  })

  return {
    runId: run?.id,
    companiesOk,
    companiesFailed,
    jobsSeen: counters.jobsSeen,
    newJobs: counters.newJobs,
  }
}
