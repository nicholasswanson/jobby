// Fires the apply worker (GitHub Actions) via repository_dispatch. The worker
// (.github/workflows/apply.yml) runs the Browserbase + Claude apply agent — kept
// out of the request path because a browser session runs for minutes.

const REPO = 'nicholasswanson/jobby'

export function applyAgentConfigured(): boolean {
  return Boolean(
    process.env.GH_DISPATCH_TOKEN &&
      process.env.BROWSERBASE_API_KEY &&
      process.env.BROWSERBASE_PROJECT_ID,
  )
}

async function repositoryDispatch(eventType: string, payload: Record<string, unknown> = {}): Promise<boolean> {
  const token = process.env.GH_DISPATCH_TOKEN
  if (!token) return false
  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  })
  return res.status === 204
}

/** Returns true if the worker was dispatched. mode: 'fill' stops at review; 'submit' also submits. */
export function dispatchApplyWorker(jobId: number, mode: 'fill' | 'submit'): Promise<boolean> {
  return repositoryDispatch('apply', { jobId, mode })
}

/** Fire the crawl workflow now (manual "Crawl now" button). */
export function dispatchCrawl(): Promise<boolean> {
  return repositoryDispatch('crawl-now')
}
