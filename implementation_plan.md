# Implementation Plan — Jobscout

Build order is chosen so real data exists before any UI is written, and the riskiest unknown (ATS slug-probe hit rate) is validated in Phase 2, not discovered in Phase 6.

Read `technical_plan.md` first for architecture, schema, endpoints, and filter specs. This document is the task sequence.

---

## Phase 0 — Scaffold

- [ ] `create-next-app` (TypeScript, App Router, Tailwind); Drizzle + Neon serverless driver; Vitest.
- [ ] Repo hygiene: `.env.example` listing all four env vars, `README.md` stub, this doc set at repo root.
- [ ] Create Neon project; wire `DATABASE_URL` locally and in Vercel.

**Done when:** app deploys to Vercel and connects to Neon from a test route.

## Phase 1 — Schema & data layer

- [ ] Drizzle schema for `companies`, `jobs`, `runs` exactly as specified in technical_plan.md.
- [ ] Migration generated and applied; unique constraints verified (`jobs.dedupe_hash`, `companies (ats_type, slug)`).
- [ ] Query helpers: `getInbox()`, `getInterested()`, `setJobStatus()`, `upsertJob()`, `recordRun()`.

**Done when:** helpers pass integration tests against a dev branch database.

## Phase 2 — Seed list builder ⚠ validation gate

- [ ] `scripts/build-seed.ts`: YC directory pull (AI/ML tags, recent batches) + public AI-startup dataset merge.
- [ ] Slug candidate generation + three-ATS probing with politeness limits.
- [ ] Idempotent upsert into `companies`; misses to `seed-misses.csv`.
- [ ] **Validation gate:** run against the full candidate list. Target ≥60% ATS detection rate and ≥150 active companies. If short, do a manual pass on the top misses before proceeding — do not continue with a thin seed list, everything downstream depends on it.

**Done when:** `companies` holds 150+ active rows with verified `(ats_type, slug)` pairs.

## Phase 3 — Crawl pipeline

- [ ] Per-source normalizers in `lib/sources/` (greenhouse, lever, ashby, remotive, wwr) with checked-in JSON fixtures from real boards.
- [ ] `lib/filters.ts` per spec: include/exclude title patterns, location classifier. Full unit coverage including edge cases ("Sr. Account Executive", "Account Manager, Enterprise", "Remote (SF)", "Remote — US only").
- [ ] `/api/cron`: secret gate → PT-hours gate → fetch → normalize → filter → dedupe → upsert → close-missing → record run. Per-company failure isolation; `consecutive_failures` auto-deactivation.
- [ ] Manual invocation locally against real boards; inspect inserted rows for sanity (titles, URLs, locations).

**Done when:** two consecutive manual runs produce: first run inserts N jobs, second run inserts ~0 (dedupe works), and a removed fixture job gets `closed`.

## Phase 4 — Inbox UI

- [ ] Login page + middleware (shared password, signed cookie).
- [ ] `/` inbox: card list newest-first with company, title, salary, remote badge, posted date, outbound link.
- [ ] Triage: Interested / Not a fit buttons; keyboard `I`/`X`/`J`/`K`; swipe gestures on mobile; optimistic updates.
- [ ] Health chip from latest `runs` row.
- [ ] Empty state ("Inbox zero — next crawl in ~N min").

**Done when:** full triage loop works on a phone; state survives refresh.

## Phase 5 — Pipeline & companies pages

- [ ] `/interested`: list with triage timestamp, `closed_while_interested` flag, and a stub actions column.
- [ ] `/companies`: seed list with active toggle and failure indicators; "re-run seed" is documented as a CLI step, not a UI button, for v1.
- [ ] Nav shell across the three pages.

**Done when:** sister can mute a company and it disappears from future crawls.

## Phase 6 — Scheduling & observability

- [ ] `.github/workflows/crawl.yml` per technical_plan.md; `CRON_SECRET` + `APP_URL` as repo secrets.
- [ ] Confirm overnight gate: manually invoke during "overnight" by faking the clock in a test, and verify a real overnight window logs skipped runs.
- [ ] Failure visibility: if the latest run is >90 min old during active hours, health chip turns amber.

**Done when:** 24 hours of unattended operation shows runs every ~30 min from 06:00–23:00 PT and none overnight.

## Phase 7 — Handoff polish

- [ ] Seed data QA with sister: skim 30–50 inbox cards together, tune `lib/filters.ts` from real misses (this is expected — budget an iteration).
- [ ] README: how to log in, how triage works, how to add/mute a company, how to re-run the seed script.
- [ ] Share URL + password.

---

## Deferred backlog (v2 candidates, in rough priority order)

1. Claude API scoring pass — fit score + one-line rationale on each card; prompt seeded with accumulated `not_a_fit` examples so the filter learns her taste.
2. Actions on interested: draft outreach email, mark applied, applied-stage tracking.
3. Daily digest notification (email) of new inbox items.
4. YC Work at a Startup as an additional source.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Slug-probe hit rate lower than expected | Medium | Phase 2 gate; manual pass on misses; companies are the unit of value |
| Keyword filters too noisy/too strict | Medium | All patterns in one tested module; Phase 7 tuning session is planned, not incidental |
| GitHub Actions schedule drift/skips | Low | Acceptable for use case; amber health chip surfaces gaps; `workflow_dispatch` fallback |
| ATS response shape changes | Low | Fixture tests fail loudly; per-company isolation contains blast radius |
| Vercel function timeout as seed list grows | Low | Bounded concurrency; shard across staggered invocations if needed |
