import { eq } from 'drizzle-orm'
import { anthropic, CLAUDE_MODEL } from './client'
import { db } from '../db/client'
import { companies } from '../db/schema'

export type CompanyEnrichment = {
  oneLiner: string | null
  description: string | null
  industry: string | null
  teamSize: number | null
  stage: string | null
  website: string | null
}

// Don't re-run a web search for a company we already tried recently and found
// nothing for (the inbox now triggers enrichment for every visible card).
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000

const SYSTEM = `You research a company using web search and return a short, factual profile. Use only the company's own website and reputable business sources. NEVER use LinkedIn, Indeed, or Glassdoor. If you cannot find reliable info, return nulls rather than guessing.

Return ONLY a JSON object (no prose, no markdown fence) with these keys:
{"oneLiner": string|null, "description": string|null, "industry": string|null, "teamSize": number|null, "stage": string|null, "website": string|null}
- oneLiner: one sentence on what the company does.
- description: 2-3 sentences of factual overview.
- industry: short label (e.g. "HR / Payroll SaaS").
- teamSize: approximate employee count as an integer, or null if unknown.
- stage: latest funding stage as a short label ("Pre-seed", "Seed", "Series A", "Series B", "Series C+", "Public", "Bootstrapped"), only when a reputable source states it; else null.
- website: the company's official homepage URL.`

/** Enrich a company on demand via web search. Best-effort; returns null on failure. */
export async function enrichCompany(companyId: number): Promise<CompanyEnrichment | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) return null

  const current: CompanyEnrichment = {
    oneLiner: company.oneLiner,
    description: company.description,
    industry: company.industry,
    teamSize: company.teamSize,
    stage: company.stage,
    website: company.website,
  }
  // Already enriched with real content → return what we have.
  if (company.oneLiner || company.description) return current
  // Tried recently and found nothing → don't spend another search yet.
  if (company.aiEnrichedAt && Date.now() - company.aiEnrichedAt.getTime() < RETRY_AFTER_MS) {
    return current
  }

  try {
    const message = await anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      messages: [
        {
          role: 'user',
          content: `Company name: ${company.name}${company.website ? `\nKnown site: ${company.website}` : ''}\n\nResearch it and return the JSON profile.`,
        },
      ],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as CompanyEnrichment

    const result: CompanyEnrichment = {
      oneLiner: parsed.oneLiner ?? null,
      description: parsed.description ?? null,
      industry: parsed.industry ?? company.industry ?? null,
      teamSize: typeof parsed.teamSize === 'number' ? Math.round(parsed.teamSize) : (company.teamSize ?? null),
      // Never overwrite a YC-seeded stage with a guess.
      stage: company.stage ?? (typeof parsed.stage === 'string' ? parsed.stage : null),
      website: parsed.website ?? company.website ?? null,
    }

    await db
      .update(companies)
      .set({ ...result, enrichedAt: new Date(), aiEnrichedAt: new Date() })
      .where(eq(companies.id, companyId))

    return result
  } catch {
    // Record the attempt so a failing company isn't retried on every page view.
    await db.update(companies).set({ aiEnrichedAt: new Date() }).where(eq(companies.id, companyId)).catch(() => {})
    return null
  }
}
