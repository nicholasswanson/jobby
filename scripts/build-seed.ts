/**
 * Seed list builder CLI (technical_plan.md § Seed list builder).
 *
 * Thin wrapper over lib/seed.ts: fetches the YC AI/ML directory, probes ATS
 * boards, upserts hits, and writes misses to seed-misses.csv for a manual pass.
 * The crawl also auto-seeds occasionally (see lib/crawl.ts) using the same
 * discovery logic — this CLI is the full, unbounded pass.
 *
 *   npm run seed              # full candidate list
 *   npm run seed -- --limit 50   # sample run
 */
import { writeFileSync } from 'node:fs'
import { fetchCandidates, probeCandidates, slugCandidates } from '../lib/seed'

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const cap = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

  console.log('Fetching YC AI/ML company directory (yc-oss)…')
  let candidates = await fetchCandidates()
  if (Number.isFinite(cap)) candidates = candidates.slice(0, cap)
  console.log(`Probing ${candidates.length} companies across 3 ATS providers…`)

  const { probed, hits, inserted, misses } = await probeCandidates(candidates)

  const csv = [
    'name,website,batch,tried_slugs',
    ...misses.map(
      (c) =>
        `"${c.name.replace(/"/g, '""')}",${c.website ?? ''},${c.batch ?? ''},"${slugCandidates(c).join(' ')}"`,
    ),
  ].join('\n')
  writeFileSync('seed-misses.csv', csv)

  const rate = probed ? ((hits / probed) * 100).toFixed(1) : '0'
  console.log('\n===== Seed summary =====')
  console.log(`Companies probed : ${probed}`)
  console.log(`ATS detected     : ${hits} (${rate}%)`)
  console.log(`Newly inserted   : ${inserted}`)
  console.log(`Misses           : ${misses.length} -> seed-misses.csv`)
  console.log('Validation gate  : target >=60% detection and >=150 active companies')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
