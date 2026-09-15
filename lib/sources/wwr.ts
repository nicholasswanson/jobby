import { descriptionSnippet } from '../text'
import type { NormalizedPosting } from './types'

// We Work Remotely sales RSS feed. WWR gives an RSS/XML document, not JSON.
// Item titles are formatted "Company Name: Job Title"; an optional <region>
// element carries a location restriction. This is an aggregator source, so each
// posting carries its own company name.
//
// We hand-roll a minimal, well-scoped RSS reader rather than add an XML-parser
// dependency (AGENTS.md: keep dependencies minimal). It targets the fields WWR
// actually emits and is covered by a checked-in fixture.

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1]) : null
}

export function normalizeWwr(rawXml: string): NormalizedPosting[] {
  const items = rawXml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []
  const postings: NormalizedPosting[] = []

  for (const item of items) {
    const rawTitle = tag(item, 'title')
    const link = tag(item, 'link')
    if (!rawTitle || !link) continue

    // "Company: Job Title" — split on the first colon.
    let companyName: string | null = null
    let title = rawTitle
    const colon = rawTitle.indexOf(':')
    if (colon > 0) {
      companyName = rawTitle.slice(0, colon).trim()
      title = rawTitle.slice(colon + 1).trim()
    }

    const region = tag(item, 'region')
    const pubDate = tag(item, 'pubDate')

    postings.push({
      externalId: tag(item, 'guid') ?? link,
      title,
      description: descriptionSnippet(tag(item, 'description')),
      location: region?.trim() ? region.trim() : null,
      salaryText: null, // WWR does not expose structured salary in its feed
      url: link,
      postedAt: pubDate ? new Date(pubDate) : null,
      companyName,
    })
  }

  return postings
}
