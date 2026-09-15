import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from './client'
import {
  companies,
  jobs,
  runs,
  type Company,
  type NewJob,
  type NewRun,
  type Job,
} from './schema'

// ATS types that correspond to a per-company board we fetch directly.
export const BOARD_ATS_TYPES = ['greenhouse', 'lever', 'ashby'] as const

// ---- Company reads / crawl bookkeeping -------------------------------------

/** Active companies that have a fetchable ATS board (excludes aggregators). */
export function getActiveBoardCompanies(): Promise<Company[]> {
  return db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.active, true),
        inArray(companies.atsType, [...BOARD_ATS_TYPES]),
      ),
    )
}

/** All companies for the /companies management page, jobs-count included. */
export function getCompaniesWithJobCounts() {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      atsType: companies.atsType,
      slug: companies.slug,
      website: companies.website,
      active: companies.active,
      consecutiveFailures: companies.consecutiveFailures,
      jobCount: sql<number>`count(${jobs.id})::int`,
    })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(desc(sql`count(${jobs.id})`), companies.name)
}

const FAILURE_DEACTIVATE_THRESHOLD = 5

export async function resetCompanyFailures(companyId: number) {
  await db
    .update(companies)
    .set({ consecutiveFailures: 0 })
    .where(eq(companies.id, companyId))
}

/** Increment a company's failure counter; auto-mute at the threshold. */
export async function recordCompanyFailure(companyId: number) {
  await db
    .update(companies)
    .set({
      consecutiveFailures: sql`${companies.consecutiveFailures} + 1`,
      active: sql`case when ${companies.consecutiveFailures} + 1 >= ${FAILURE_DEACTIVATE_THRESHOLD} then false else ${companies.active} end`,
    })
    .where(eq(companies.id, companyId))
}

/**
 * Resolve (or create) the company row for an aggregator posting, keyed by the
 * employer name. Aggregators (Remotive, WWR) surface many employers through one
 * feed, so their company rows are created on the fly.
 */
export async function getOrCreateAggregatorCompany(
  name: string,
  source: string,
): Promise<Company> {
  const slug = name.trim().toLowerCase()
  const inserted = await db
    .insert(companies)
    .values({ name: name.trim(), atsType: 'aggregator', slug, source })
    .onConflictDoNothing({ target: [companies.atsType, companies.slug] })
    .returning()
  if (inserted.length > 0) return inserted[0]

  const [existing] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.atsType, 'aggregator'), eq(companies.slug, slug)))
    .limit(1)
  return existing
}

export async function upsertSeedCompany(input: {
  name: string
  atsType: string
  slug: string
  website?: string | null
  source?: string | null
}): Promise<{ isNew: boolean }> {
  const inserted = await db
    .insert(companies)
    .values(input)
    .onConflictDoNothing({ target: [companies.atsType, companies.slug] })
    .returning()
  return { isNew: inserted.length > 0 }
}

// ---- Inbox / pipeline reads -------------------------------------------------

export function getInbox() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      remoteType: jobs.remoteType,
      salaryText: jobs.salaryText,
      url: jobs.url,
      postedAt: jobs.postedAt,
      firstSeen: jobs.firstSeen,
      status: jobs.status,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.status, 'inbox'))
    .orderBy(desc(jobs.firstSeen))
}

export function getInterested() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      remoteType: jobs.remoteType,
      salaryText: jobs.salaryText,
      url: jobs.url,
      postedAt: jobs.postedAt,
      triagedAt: jobs.triagedAt,
      closedWhileInterested: jobs.closedWhileInterested,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.status, 'interested'))
    .orderBy(desc(jobs.triagedAt))
}

// ---- Triage write -----------------------------------------------------------

export type TriageStatus = 'inbox' | 'interested' | 'not_a_fit' | 'closed'

export async function setJobStatus(jobId: number, status: TriageStatus) {
  await db
    .update(jobs)
    .set({ status, triagedAt: sql`now()` })
    .where(eq(jobs.id, jobId))
}

// ---- Crawl-time upsert ------------------------------------------------------

export type UpsertResult = { job: Job; isNew: boolean }

/**
 * Insert a net-new job (status 'inbox') or, if the dedupe hash already exists,
 * bump last_seen only. Idempotent: running the same crawl twice inserts nothing
 * the second time.
 */
export async function upsertJob(input: NewJob): Promise<UpsertResult> {
  const inserted = await db
    .insert(jobs)
    .values(input)
    .onConflictDoNothing({ target: jobs.dedupeHash })
    .returning()

  if (inserted.length > 0) {
    return { job: inserted[0], isNew: true }
  }

  const updated = await db
    .update(jobs)
    .set({ lastSeen: sql`now()` })
    .where(eq(jobs.dedupeHash, input.dedupeHash))
    .returning()

  return { job: updated[0], isNew: false }
}

/**
 * Close jobs belonging to successfully-crawled companies that were NOT seen in
 * this run. `interested` jobs are never hidden — they are flagged
 * `closed_while_interested` instead.
 */
export async function closeMissingJobs(companyIds: number[], seenJobIds: number[]) {
  if (companyIds.length === 0) return

  // Flag interested jobs that vanished from their board.
  await db
    .update(jobs)
    .set({ closedWhileInterested: true })
    .where(
      and(
        inArray(jobs.companyId, companyIds),
        eq(jobs.status, 'interested'),
        seenJobIds.length > 0 ? notInArray(jobs.id, seenJobIds) : undefined,
      ),
    )

  // Close inbox / not_a_fit jobs that vanished.
  await db
    .update(jobs)
    .set({ status: 'closed' })
    .where(
      and(
        inArray(jobs.companyId, companyIds),
        inArray(jobs.status, ['inbox', 'not_a_fit']),
        seenJobIds.length > 0 ? notInArray(jobs.id, seenJobIds) : undefined,
      ),
    )
}

// ---- Runs -------------------------------------------------------------------

export async function recordRun(input: NewRun) {
  const [row] = await db.insert(runs).values(input).returning()
  return row
}

export function getLatestRun() {
  return db.select().from(runs).orderBy(desc(runs.id)).limit(1)
}
