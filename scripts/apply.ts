/**
 * Apply-agent entrypoint. Runs in GitHub Actions (repository_dispatch 'apply'),
 * driven by JOB_ID + APPLY_MODE. Kept out of the Vercel request path because a
 * browser session runs for minutes.
 */
import { runApply } from '../lib/apply/agent'

async function main() {
  const jobId = Number(process.env.JOB_ID)
  if (!Number.isFinite(jobId)) throw new Error('JOB_ID is required')
  const mode = process.env.APPLY_MODE === 'submit' ? 'submit' : 'fill'
  console.log(`apply agent: job ${jobId}, mode ${mode}`)
  await runApply(jobId, mode)
  console.log('done')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
