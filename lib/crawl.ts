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
  recordCompanyFailure,
  recordRun,
  resetCompanyFailures,
  upsertJob,
} from './db/queries'
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

type Counters = { jobsSeen: number; newJobs: number; seenJobIds: number[] }

/**
 * Turn a batch of normalized postings for a known company into upserts.
 * Filtered-out postings are ignored. Returns per-batch counters.
 */
async function ingestPostings(
  companyId: number,
  postings: NormalizedPosting[],
  counters: Counters,
) {
  for (const p of postings) {
    const verdict = filterJob({ title: p.title, location: p.location })
    if (!verdict.included) continue

    counters.jobsSeen += 1
    const { job, isNew } = await upsertJob({
      companyId,
      externalId: p.externalId,
      dedupeHash: dedupeHash(companyId, p.title, p.location),
      title: p.title,
      location: p.location,
      remoteType: verdict.remoteType,
      salaryText: p.salaryText,
      url: p.url,
      postedAt: p.postedAt,
    })
    counters.seenJobIds.push(job.id)
    if (isNew) counters.newJobs += 1
  }
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
        const verdict = filterJob({ title: p.title, location: p.location })
        if (!verdict.included) continue
        const name = p.companyName?.trim()
        if (!name) continue

        const company = await getOrCreateAggregatorCompany(name, agg.key)
        if (!company || !company.active) continue

        counters.jobsSeen += 1
        const { isNew } = await upsertJob({
          companyId: company.id,
          externalId: p.externalId,
          dedupeHash: dedupeHash(company.id, p.title, p.location),
          title: p.title,
          location: p.location,
          remoteType: verdict.remoteType,
          salaryText: p.salaryText,
          url: p.url,
          postedAt: p.postedAt,
        })
        if (isNew) counters.newJobs += 1
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
  const counters: Counters = { jobsSeen: 0, newJobs: 0, seenJobIds: [] }
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
