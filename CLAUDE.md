@AGENTS.md

## Claude Code notes

- Work through `implementation_plan.md` phase by phase; do not skip the Phase 2 validation gate (seed-list ATS detection rate) before building the crawler.
- Use plan mode for schema changes and anything touching `/api/cron`.
- After completing a phase, run `npm run build && npm run test` and check off the phase's tasks in `implementation_plan.md`.
