import {
  boolean,
  integer,
  jsonb,
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
  categories: text('categories').array(), // role feeds: account_management | sales | engineering
  location: text('location'),
  remoteType: text('remote_type'), // 'remote' | 'remote_us' | 'remote_restricted'
  salaryText: text('salary_text'),
  url: text('url').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull().default('inbox'), // 'inbox' | 'interested' | 'not_a_fit' | 'closed' | 'filtered'
  filterReason: text('filter_reason'), // set when status='filtered': 'seniority' | 'geo' | 'onsite'
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
  // Set when this run also refreshed the company seed list (discovers new YC
  // companies). Gated to ~once/day so most crawl runs leave it null.
  seededAt: timestamp('seeded_at', { withTimezone: true }),
})

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert

// --- Résumé + apply subsystem (see the approved plan) --------------------------
// Binary (PDF, screenshots) is stored base64-encoded in text columns — résumés
// are ~100KB, one row, two users. Keeps us off Supabase Storage / extra keys.

// Singleton (id always 1): the base résumé PDF.
export const resume = pgTable('resume', {
  id: integer('id').primaryKey().default(1),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull().default('application/pdf'),
  dataBase64: text('data_base64').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
})

// Singleton (id always 1): reusable answers the apply agent prefills from.
export const applicationProfile = pgTable('application_profile', {
  id: integer('id').primaryKey().default(1),
  fullName: text('full_name'),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  linkedinUrl: text('linkedin_url'),
  websiteUrl: text('website_url'),
  workAuthorization: text('work_authorization'), // e.g. "US citizen; authorized to work in the US"
  requiresSponsorship: boolean('requires_sponsorship').notNull().default(false),
  willingToRelocate: boolean('willing_to_relocate').notNull().default(false),
  declineDemographics: boolean('decline_demographics').notNull().default(true),
  extraAnswers: jsonb('extra_answers').$type<{ question: string; answer: string }[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Per-job tailored résumé (generated when the job is marked interested).
export const jobTailoring = pgTable('job_tailoring', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id),
  status: text('status').notNull().default('pending'), // 'pending' | 'ready' | 'error'
  tailoredMarkdown: text('tailored_markdown'),
  rationale: text('rationale'),
  model: text('model'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Per-job application-agent run.
export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id),
  // 'queued' | 'running' | 'needs_review' | 'submitted' | 'failed' | 'unsupported'
  status: text('status').notNull().default('queued'),
  atsType: text('ats_type'),
  applyUrl: text('apply_url'),
  sessionUrl: text('session_url'), // Browserbase live/replay URL
  screenshotBase64: text('screenshot_base64'), // completed-but-unsubmitted form
  log: jsonb('log').$type<{ step: string; detail?: string; at: string }[]>(),
  error: text('error'),
  autoSubmit: boolean('auto_submit').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Resume = typeof resume.$inferSelect
export type ApplicationProfile = typeof applicationProfile.$inferSelect
export type JobTailoring = typeof jobTailoring.$inferSelect
export type Application = typeof applications.$inferSelect
