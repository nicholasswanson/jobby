import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

// Dynamic: this touches the database on every request.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [row] = await db.execute<{ ok: number }>(sql`select 1 as ok`)
    return Response.json({ ok: true, db: row?.ok === 1 })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
