/**
 * Run the crawl pipeline locally against real boards.
 *   npm run crawl:local            # forces past the overnight gate
 *   npm run crawl:local -- --gate  # respects the overnight PT gate
 */
import { runCrawl } from '../lib/crawl'

async function main() {
  const respectGate = process.argv.includes('--gate')
  const started = Date.now()
  const result = await runCrawl({ force: !respectGate })
  console.log(JSON.stringify(result, null, 2))
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
