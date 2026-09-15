import { politeFetch } from './sources'
import { htmlToText, truncate } from './text'

/**
 * Best-effort company enrichment for companies the YC directory didn't cover
 * (e.g. aggregator employers): fetch the company's OWN homepage and read its
 * meta description. Public, first-party data only — never LinkedIn/Indeed/
 * Glassdoor (AGENTS.md hard rule #1). Failure-isolated: returns null on any error.
 */
export async function fetchSiteDescription(website: string): Promise<string | null> {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`
    const res = await politeFetch(url, { timeoutMs: 8000 })
    const html = await res.text()
    const metaTag =
      html.match(
        /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i,
      )?.[0] ?? ''
    const content = metaTag.match(/content=["']([^"']*)["']/i)?.[1]
    const text = content ? truncate(htmlToText(content), 400) : ''
    return text || null
  } catch {
    return null
  }
}
