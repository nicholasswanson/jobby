# Technical Plan — Jobscout

A remote job-discovery dashboard for early-career account management / sales roles at AI startups. Crawls company ATS boards every 30 minutes (paused overnight PT), filters by keyword, and surfaces net-new roles in a triage inbox.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | UI + API routes in one deploy |
| Hosting | Vercel (Hobby) | Cron NOT used — see Scheduling |
| Database | Supabase (Postgres) | postgres-js driver (`postgres`) over the Supabase transaction pooler (port 6543) for serverless |
| ORM | Drizzle | Schema-as-code, `drizzle-kit` migrations |
| Styling | Tailwind CSS | |
| Scheduler | GitHub Actions | Free 30-min trigger; Vercel Hobby cron is daily-only |
| Auth | Shared password → signed cookie | Two users; no accounts |

## Architecture

```
GitHub Actions (*/30 * * * *)
        │  GET + Authorization: Bearer $CRON_SECRET
        ▼
/api/cron ──► gate: reject bad secret; no-op 23:00–06:00 America/Los_Angeles
        │
        ▼
Crawl pipeline
  fetch (ATS boards + aggregators, concurrency-limited)
  → normalize → filter → dedupe → upsert
        │
        ▼
Supabase Postgres ◄── Next.js dashboard (inbox / interested / companies)
```

## Data model

```sql
companies (
  id            serial PK,
  name          text NOT NULL,
  ats_type      text NOT NULL,      -- 'greenhouse' | 'lever' | 'ashby' | 'aggregator'
  slug          text,               -- ATS board slug; UNIQUE (ats_type, slug)
  website       text,
  source        text,               -- 'yc' | 'dataset' | 'manual'
  active        boolean DEFAULT true,   -- user can mute a company
  consecutive_failures int DEFAULT 0,   -- auto-deactivate at threshold
  created_at    timestamptz DEFAULT now()
)

jobs (
  id            serial PK,
  company_id    int REFERENCES companies,
  external_id   text,               -- ATS's own job id when available
  dedupe_hash   text UNIQUE NOT NULL,  -- sha256(company_id + norm_title + norm_location)
  title         text NOT NULL,
  location      text,
  remote_type   text,               -- 'remote' | 'remote_us' | 'remote_restricted'
  salary_text   text,               -- raw compensation string if posted
  url           text NOT NULL,
  posted_at     timestamptz,
  first_seen    timestamptz DEFAULT now(),
  last_seen     timestamptz DEFAULT now(),
  status        text DEFAULT 'inbox',  -- 'inbox' | 'interested' | 'not_a_fit' | 'closed'
  triaged_at    timestamptz
)

runs (
  id            serial PK,
  started_at    timestamptz,
  finished_at   timestamptz,
  companies_ok  int,
  companies_failed int,
  jobs_seen     int,
  new_jobs      int,
  error_summary text
)
```

Status transitions: `inbox → interested | not_a_fit` (user); `any → closed` (crawler, when a job disappears from its board — except keep `interested` and flag `closed_while_interested` in the UI instead of hiding it). `not_a_fit` verdicts are retained; they seed a future learning pass.

## Sources

**Primary — public ATS board APIs (no auth, official, JSON):**

| ATS | Endpoint |
|---|---|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` |
| Lever | `https://api.lever.co/v0/postings/{slug}?mode=json` |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{slug}` |

**Supplemental aggregators:**
- Remotive public API — `https://remotive.com/api/remote-jobs?category=sales` (remote-only by definition)
- We Work Remotely RSS — sales category feed
- YC Work at a Startup (stretch; only if a stable public endpoint is confirmed during build)

**Hard rule: no scraping of LinkedIn, Indeed, or Glassdoor.** ToS-hostile, bot-detected, brittle. Not worth it in any form.

## Seed list builder (`scripts/build-seed.ts`)

1. Query YC's public company directory (the Algolia index that powers `ycombinator.com/companies`, using the public client credentials from that page) filtered to AI/ML industry tags, recent batches (last ~3 years).
2. Merge in 1–2 maintained public datasets of funded AI startups (GitHub "awesome" lists / open funding datasets) for non-YC coverage.
3. **ATS detection by slug probing:** for each company, generate slug candidates from the name (`acme`, `acme-ai`, `acmeai`, domain stem) and probe all three ATS endpoints. HTTP 200 + parseable JSON with a jobs array ⇒ lock in `(ats_type, slug)`. All misses ⇒ write to `seed-misses.csv` for a quick manual pass.
4. Upsert into `companies`. Script is idempotent and re-runnable to refresh the list (e.g., new YC batch).

Politeness: ≤5 concurrent probes, 10s timeout, exponential backoff on 429.

## Crawl pipeline (`/api/cron`)

1. **Gate:** verify `Authorization: Bearer ${CRON_SECRET}`; compute current hour in `America/Los_Angeles` (via `Intl.DateTimeFormat`) and return `{skipped: 'overnight'}` between 23:00–05:59. DST handled automatically.
2. **Fetch:** all `active` companies, concurrency-limited (`p-limit`, ~8), 10s timeout per request. A failing company increments `consecutive_failures` (auto-set `active=false` at 5) and never fails the run.
3. **Normalize** each posting to `{externalId, title, location, salaryText, url, postedAt}` per-source in `lib/sources/{greenhouse,lever,ashby,remotive,wwr}.ts`.
4. **Filter** (see below).
5. **Dedupe:** `dedupe_hash = sha256(companyId|lower(trim(title))|lower(trim(location)))`. Existing hash ⇒ bump `last_seen` only. New hash ⇒ insert with `status='inbox'`.
6. **Close:** jobs of successfully-crawled companies not seen this run ⇒ `status='closed'` (with the `interested` carve-out above).
7. **Record** a `runs` row either way (including skipped runs, cheaply), powering the dashboard health chip.

Keep total run time well under Vercel's function duration limit: conditional requests where supported, bounded concurrency, and if the seed list grows past what one invocation handles comfortably, shard companies across two staggered cron hits.

## Filters (`lib/filters.ts` — single module, fully unit-tested)

```ts
// Title must match at least one:
INCLUDE = /account manager|account executive|sales development|(^|\W)sdr(\W|$)|(^|\W)bdr(\W|$)|business development rep|customer success|sales associate|inside sales|account associate/i

// Title must match none:
EXCLUDE = /senior|\bsr\.?\b|staff|principal|director|vp\b|vice president|head of|lead\b|manager,\s*sales|enterprise account/i
```

Location classification: `remote` (fully remote / worldwide), `remote_us` (US-restricted — kept, badged), drop `hybrid|on-?site|in.?office`. Ambiguous locations are kept and badged `⚠ verify` rather than silently dropped — false negatives are worse than an occasional bad card.

All patterns live in one file with a fixture-driven test suite (real JSON payloads from each ATS checked into `tests/fixtures/`). Tuning the filters = editing one file + green tests.

## Dashboard

- `/` **Inbox** — cards newest-first: company, title, salary (if posted), remote badge, posted date, outbound link. Keyboard: `I` = interested, `X` = not a fit, `J/K` navigate. Mobile: swipe right/left. Optimistic updates via server actions.
- `/interested` — pipeline list; placeholder actions column (future: draft outreach, mark applied).
- `/companies` — seed list, per-company active toggle, failure indicators.
- Health chip in the shell: "Last crawl 14 min ago · 3 new" from latest `runs` row.

## Auth

Middleware checks a signed httpOnly cookie; `/login` posts the shared password (compared against `APP_PASSWORD` env, constant-time). Everything except `/login` and `/api/cron` is behind it.

## Environment variables

```
DATABASE_URL      # Supabase Postgres connection string (transaction pooler, port 6543)
CRON_SECRET       # bearer token for /api/cron (also a GitHub Actions secret)
APP_PASSWORD      # shared login password
COOKIE_SECRET     # cookie signing key
```

## Scheduling (GitHub Actions)

`.github/workflows/crawl.yml`:

```yaml
on:
  schedule:
    - cron: "*/30 * * * *"   # fires 24/7; the endpoint gates overnight PT
  workflow_dispatch:          # manual trigger for testing
jobs:
  crawl:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "$APP_URL/api/cron"
```

Note: GitHub Actions schedules can drift a few minutes under load — acceptable for this use case. `workflow_dispatch` gives a manual "crawl now" button.

## Deferred (explicitly out of v1)

- Claude API scoring pass (fit score + "why it matched"; can learn from accumulated `not_a_fit` verdicts)
- Actions on interested jobs (outreach drafts, resume tailoring, applied-tracking)
- Email/SMS digest of new inbox items
- Multi-user accounts
