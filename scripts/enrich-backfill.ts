/**
 * One-off / occasional: run Claude web-search enrichment for every company that
 * has open (inbox or interested) jobs but no profile yet, so cards show
 * industry / headcount / funding stage without anyone opening them first.
 *
 *   npm run enrich:backfill            # all such companies
 *   npm run enrich:backfill -- --limit 10
 *
 * Each company is one web-search call (10–40 s); runs 3 at a time.
 */
import pLimit from 'p-limit'
import { sql } from 'drizzle-orm'
import { db } from '../lib/db/client'
import { enrichCompany } from '../lib/ai/enrichCompany'

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const cap = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

  const rows = (await db.execute(
    sql.raw(`
      select c.id, c.name
      from companies c
      where c.one_liner is null and c.description is null
        and (c.ai_enriched_at is null or c.ai_enriched_at < now() - interval '7 days')
        and exists (select 1 from jobs j where j.company_id = c.id and j.status in ('inbox', 'interested'))
      order by c.id
    `),
  )) as { id: number; name: string }[]
  const todo = Number.isFinite(cap) ? rows.slice(0, cap) : rows
  console.log(`enriching ${todo.length} companies…`)

  const limit = pLimit(3)
  let filled = 0
  await Promise.all(
    todo.map((c) =>
      limit(async () => {
        const r = await enrichCompany(c.id)
        const ok = Boolean(r?.oneLiner || r?.industry || r?.teamSize || r?.stage)
        if (ok) filled += 1
        console.log(`${ok ? '✓' : '·'} ${c.name}${r?.industry ? ` — ${r.industry}` : ''}${r?.teamSize ? `, ~${r.teamSize} people` : ''}${r?.stage ? `, ${r.stage}` : ''}`)
      }),
    ),
  )
  console.log(`done: ${filled}/${todo.length} got data`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
