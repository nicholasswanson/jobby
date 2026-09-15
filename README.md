# Jobscout

A two-user job-discovery dashboard. Crawls AI-startup ATS boards every 30 minutes for
early-career remote account management / sales roles and surfaces net-new postings in a
triage inbox (Interested / Not a fit).

See [`technical_plan.md`](./technical_plan.md) for architecture and specs, and
[`implementation_plan.md`](./implementation_plan.md) for the build sequence.

## Stack

Next.js (App Router, TypeScript) · Tailwind · Drizzle ORM · Supabase Postgres · Vercel ·
GitHub Actions (30-min crawl trigger).

## Local setup

```bash
cp .env.example .env.local   # fill in the four values (see below)
npm install
npm run db:migrate           # apply schema to your Supabase database
npm run dev
```

### Environment variables

| Var | What |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (transaction pooler, port 6543) |
| `CRON_SECRET` | Bearer token guarding `/api/cron`; also a GitHub Actions secret |
| `APP_PASSWORD` | Shared login password |
| `COOKIE_SECRET` | Session-cookie signing key |

## Common commands

```bash
npm run dev            # local dev server
npm run build          # production build
npm run test           # vitest (filters + normalizers are the critical suites)
npm run db:generate    # generate a migration from schema changes
npm run db:migrate     # apply migrations
npm run seed           # build/refresh the company seed list
npm run crawl:local    # run the crawl pipeline locally against real boards
```

## How it works

- **Seed** (`scripts/build-seed.ts`) discovers AI-startup ATS boards by slug-probing
  Greenhouse / Lever / Ashby and upserts them into `companies`.
- **Crawl** (`/api/cron`, triggered by GitHub Actions every 30 min, paused 23:00–06:00 PT)
  fetches active boards, normalizes, filters, dedupes, and upserts net-new jobs as `inbox`.
- **Triage** the inbox at `/` — Interested / Not a fit, keyboard or swipe. `/interested`
  is the pipeline; `/companies` lets you mute a company.
