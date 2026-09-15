import { NextResponse } from 'next/server'
import { enrichCompany } from '@/lib/ai/enrichCompany'

// Company enrichment runs Claude web-search (10–40s). It lives in a route handler
// — NOT a server action — so it never serializes behind (and blocks) the panel's
// loadJobDetail server action when the user clicks between cards.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await ctx.params
  const id = Number(companyId)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'bad company id' }, { status: 400 })
  }
  const result = await enrichCompany(id)
  return NextResponse.json(result)
}
