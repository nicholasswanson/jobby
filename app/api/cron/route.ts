import type { NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawl'
import { verifyCronAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds; stay under Vercel's function limit

export async function GET(request: NextRequest) {
  // Gate 1: bearer secret (constant-time).
  if (!verifyCronAuth(request.headers.get('authorization'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Gate 2 (overnight PT) lives inside runCrawl so it is recorded as a run.
  const force = request.nextUrl.searchParams.get('force') === '1'

  try {
    const result = await runCrawl({ force })
    return Response.json(result)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
