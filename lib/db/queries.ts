import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from './client'
import {
  applicationProfile,
  applications,
  companies,
  jobTailoring,
  jobs,
  resume,
  runs,
  type Application,
  type ApplicationProfile,
  type Company,
  type JobTailoring,
  type NewJob,
  type NewRun,
  type Job,
  type Resume,
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
// Send enough text that the card's CSS line-clamp does the truncation (ellipsis
// at the right edge) instead of a hard mid-word SQL cut.
const CARD_SNIPPET = sql<string | null>`left(${jobs.description}, 800)`
// Hard cutoff: never show jobs whose effective posted date is >90 days old.
const WITHIN_90_DAYS = sql`coalesce(${jobs.postedAt}, ${jobs.firstSeen}) >= now() - interval '90 days'`

// Role feeds. 'all' (default) shows every category; the others filter to one.
export const INBOX_FEEDS = ['all', 'account_management', 'sales', 'engineering'] as const
export type InboxFeed = (typeof INBOX_FEEDS)[number]

function feedCategories(feed: InboxFeed): string[] | null {
  return feed === 'all' ? null : [feed]
}

export function getInbox(feed: InboxFeed = 'all') {
  const conds = [eq(jobs.status, 'inbox'), WITHIN_90_DAYS]
  const cats = feedCategories(feed)
  if (cats) {
    const arr = sql.join(
      cats.map((c) => sql`${c}`),
      sql`, `,
    )
    conds.push(sql`${jobs.categories} && ARRAY[${arr}]::text[]`)
  }
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
      companyId: jobs.companyId,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conds))
    .orderBy(desc(jobs.firstSeen))
}

/** Mute a company and drop its currently-open inbox jobs. */
export async function hideCompany(companyId: number) {
  await db.update(companies).set({ active: false }).where(eq(companies.id, companyId))
  await db
    .update(jobs)
    .set({ status: 'closed' })
    .where(and(eq(jobs.companyId, companyId), eq(jobs.status, 'inbox')))
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
  // salary / categories can change after first sight; backfills older rows too).
  const updated = await db
    .update(jobs)
    .set({
      lastSeen: sql`now()`,
      description: input.description,
      salaryText: input.salaryText,
      categories: input.categories,
    })
    .where(eq(jobs.dedupeHash, input.dedupeHash))
    .returning()

  return { job: updated[0], isNew: false }
}

/**
 * Batch upsert many jobs in a single round-trip (used per company by the crawl).
 * Returns {id, isNew} in input order. Refreshes description/salary/categories on
 * conflict; never touches `status` (preserves triage). Caller must pre-dedupe by
 * dedupe_hash (Postgres rejects a hash appearing twice in one ON CONFLICT batch).
 */
export async function upsertJobs(rows: NewJob[]): Promise<{ id: number; isNew: boolean }[]> {
  if (rows.length === 0) return []
  return db
    .insert(jobs)
    .values(rows)
    .onConflictDoUpdate({
      target: jobs.dedupeHash,
      set: {
        lastSeen: sql`now()`,
        description: sql`excluded.description`,
        salaryText: sql`excluded.salary_text`,
        categories: sql`excluded.categories`,
      },
    })
    .returning({ id: jobs.id, isNew: sql<boolean>`(xmax = 0)` })
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

// ---- Résumé + apply subsystem ----------------------------------------------

export async function getResume(): Promise<Resume | null> {
  const [row] = await db.select().from(resume).where(eq(resume.id, 1)).limit(1)
  return row ?? null
}

export async function upsertResume(input: { fileName: string; mimeType: string; dataBase64: string }) {
  await db
    .insert(resume)
    .values({ id: 1, ...input, uploadedAt: sql`now()` })
    .onConflictDoUpdate({
      target: resume.id,
      set: { ...input, uploadedAt: sql`now()` },
    })
}

export async function getProfile(): Promise<ApplicationProfile | null> {
  const [row] = await db
    .select()
    .from(applicationProfile)
    .where(eq(applicationProfile.id, 1))
    .limit(1)
  return row ?? null
}

export type ProfileInput = Partial<Omit<ApplicationProfile, 'id' | 'updatedAt'>>

export async function upsertProfile(input: ProfileInput) {
  await db
    .insert(applicationProfile)
    .values({ id: 1, ...input, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: applicationProfile.id,
      set: { ...input, updatedAt: sql`now()` },
    })
}

export async function getTailoring(jobId: number): Promise<JobTailoring | null> {
  const [row] = await db
    .select()
    .from(jobTailoring)
    .where(eq(jobTailoring.jobId, jobId))
    .limit(1)
  return row ?? null
}

export async function upsertTailoring(
  jobId: number,
  input: Partial<Pick<JobTailoring, 'status' | 'tailoredMarkdown' | 'rationale' | 'model' | 'error'>>,
) {
  await db
    .insert(jobTailoring)
    .values({ jobId, ...input, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: jobTailoring.jobId,
      set: { ...input, updatedAt: sql`now()` },
    })
}

export async function getApplication(jobId: number): Promise<Application | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(eq(applications.jobId, jobId))
    .limit(1)
  return row ?? null
}

export async function upsertApplication(
  jobId: number,
  input: Partial<
    Pick<
      Application,
      | 'status'
      | 'atsType'
      | 'applyUrl'
      | 'sessionUrl'
      | 'screenshotBase64'
      | 'log'
      | 'error'
      | 'autoSubmit'
    >
  >,
) {
  await db
    .insert(applications)
    .values({ jobId, ...input, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: applications.jobId,
      set: { ...input, updatedAt: sql`now()` },
    })
}
