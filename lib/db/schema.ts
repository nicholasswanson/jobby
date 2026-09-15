import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// See technical_plan.md § Data model. This schema is the source of truth;
// migrations are generated from it via `npm run db:generate`.

export const companies = pgTable(
  'companies',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    atsType: text('ats_type').notNull(), // 'greenhouse' | 'lever' | 'ashby' | 'aggregator'
    slug: text('slug'), // ATS board slug
    website: text('website'),
    source: text('source'), // 'yc' | 'dataset' | 'manual'
    active: boolean('active').notNull().default(true), // user can mute a company
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    // Enrichment (from the YC directory at seed time, or the company's own site
    // meta at crawl time). No LinkedIn/Indeed/Glassdoor (AGENTS.md hard rule #1).
    oneLiner: text('one_liner'),
    description: text('description'),
    teamSize: integer('team_size'),
    industry: text('industry'),
    batch: text('batch'),
    stage: text('stage'),
    enrichedAt: timestamp('enriched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('companies_ats_slug_unq').on(t.atsType, t.slug)],
)

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  externalId: text('external_id'), // ATS's own job id when available
  dedupeHash: text('dedupe_hash').notNull().unique(), // sha256(companyId|title|location)
  title: text('title').notNull(),
  description: text('description'), // plain-text snippet (untrusted; rendered escaped)
  location: text('location'),
  remoteType: text('remote_type'), // 'remote' | 'remote_us' | 'remote_restricted'
  salaryText: text('salary_text'),
  url: text('url').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('inbox'), // 'inbox' | 'interested' | 'not_a_fit' | 'closed'
  closedWhileInterested: boolean('closed_while_interested').notNull().default(false),
  triagedAt: timestamp('triaged_at', { withTimezone: true }),
})

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  companiesOk: integer('companies_ok'),
  companiesFailed: integer('companies_failed'),
  jobsSeen: integer('jobs_seen'),
  newJobs: integer('new_jobs'),
  skipped: boolean('skipped').notNull().default(false),
  errorSummary: text('error_summary'),
})

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert
