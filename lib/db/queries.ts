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

/**
 * Mark a company enriched (stamps enriched_at so we don't refetch every crawl);
 * fills description only if we found one and it's currently empty.
 */
export async function markCompanyEnriched(companyId: number, description: string | null) {
  await db
    .update(companies)
    .set({
      description: sql`coalesce(${companies.description}, ${description ?? null})`,
      enrichedAt: sql`now()`,
    })
    .where(eq(companies.id, companyId))
}

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

export type SeedCompanyInput = {
  name: string
  atsType: string
  slug: string
  website?: string | null
  source?: string | null
  oneLiner?: string | null
  description?: string | null
  teamSize?: number | null
  industry?: string | null
  batch?: string | null
  stage?: string | null
}

export async function upsertSeedCompany(input: SeedCompanyInput): Promise<{ isNew: boolean }> {
  const enrichedAt = sql`now()`
  const rows = await db
    .insert(companies)
    .values({ ...input, enrichedAt })
    .onConflictDoUpdate({
      target: [companies.atsType, companies.slug],
      // Refresh identity + enrichment on re-seed; never touch `active`
      // (user mute) or `consecutive_failures`.
      set: {
        name: input.name,
        website: input.website ?? null,
        oneLiner: input.oneLiner ?? null,
        description: input.description ?? null,
        teamSize: input.teamSize ?? null,
        industry: input.industry ?? null,
        batch: input.batch ?? null,
        stage: input.stage ?? null,
        enrichedAt,
      },
    })
    // xmax = 0 ⇒ this row was inserted (not updated) by the upsert.
    .returning({ inserted: sql<boolean>`(xmax = 0)` })
  return { isNew: rows[0]?.inserted ?? false }
}

// ---- Inbox / pipeline reads -------------------------------------------------

// Cards show a short snippet (clamped to 4 lines); the detail panel loads the
// full text via getJobDetail. Keeps the inbox payload small.
const CARD_SNIPPET = sql<string | null>`left(${jobs.description}, 320)`
// Hard cutoff: never show jobs whose effective posted date is >90 days old.
const WITHIN_90_DAYS = sql`coalesce(${jobs.postedAt}, ${jobs.firstSeen}) >= now() - interval '90 days'`

export function getInbox() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      snippet: CARD_SNIPPET,
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
    .where(and(eq(jobs.status, 'inbox'), WITHIN_90_DAYS))
    .orderBy(desc(jobs.firstSeen))
}

/** Full job + company enrichment for the detail side panel. */
export async function getJobDetail(jobId: number) {
  const [row] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      location: jobs.location,
      remoteType: jobs.remoteType,
      salaryText: jobs.salaryText,
      url: jobs.url,
      postedAt: jobs.postedAt,
      firstSeen: jobs.firstSeen,
      status: jobs.status,
      company: {
        id: companies.id,
        name: companies.name,
        website: companies.website,
        atsType: companies.atsType,
        oneLiner: companies.oneLiner,
        description: companies.description,
        teamSize: companies.teamSize,
        industry: companies.industry,
        batch: companies.batch,
        stage: companies.stage,
      },
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .limit(1)
  return row ?? null
}

export function getInterested() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      snippet: CARD_SNIPPET,
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

// ---- Settings reads ---------------------------------------------------------

/** Muted companies (active=false) — the "block list". */
export function getBlockedCompanies() {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      atsType: companies.atsType,
      slug: companies.slug,
    })
    .from(companies)
    .where(eq(companies.active, false))
    .orderBy(companies.name)
}

/** History of triage decisions (interested / not a fit), newest first. */
export function getActivityHistory() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      url: jobs.url,
      status: jobs.status,
      triagedAt: jobs.triagedAt,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(inArray(jobs.status, ['interested', 'not_a_fit']))
    .orderBy(desc(jobs.triagedAt))
    .limit(200)
}

/** Relevant roles excluded by the filter (open only), for review + override. */
export function getFilteredJobs() {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      snippet: CARD_SNIPPET,
      location: jobs.location,
      url: jobs.url,
      filterReason: jobs.filterReason,
      postedAt: jobs.postedAt,
      firstSeen: jobs.firstSeen,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eq(jobs.status, 'filtered'), WITHIN_90_DAYS))
    .orderBy(desc(jobs.firstSeen))
    .limit(300)
}

/** Override a filter/triage decision: move a job (back) into the inbox. */
export async function restoreToInbox(jobId: number) {
  await db
    .update(jobs)
    .set({ status: 'inbox', filterReason: null, triagedAt: null })
    .where(eq(jobs.id, jobId))
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

  // Existing posting: bump last_seen and refresh mutable content (description /
  // salary can appear or change after first sight; backfills older rows too).
  const updated = await db
    .update(jobs)
    .set({ lastSeen: sql`now()`, description: input.description, salaryText: input.salaryText })
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

  // Close inbox / not_a_fit / filtered jobs that vanished from the board.
  await db
    .update(jobs)
    .set({ status: 'closed' })
    .where(
      and(
        inArray(jobs.companyId, companyIds),
        inArray(jobs.status, ['inbox', 'not_a_fit', 'filtered']),
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
