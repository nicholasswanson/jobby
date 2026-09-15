// Turn an ATS description (HTML or plain) into a short, safe plain-text snippet.
// Crawled content is untrusted (AGENTS.md hard rule #3): we strip all markup and
// store only text, which React then renders escaped. Never rendered as HTML.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#039': "'",
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/**
 * Strip HTML tags/entities and collapse whitespace to a single-spaced string.
 * Decodes entities first so HTML-escaped payloads (e.g. Greenhouse `content`,
 * where tags arrive as `&lt;p&gt;`) become real tags before stripping; a second
 * decode handles any double-encoding.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return ''
  const decoded = decodeEntities(input)
  const stripped = decoded
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|br|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim()
}

/** Truncate on a word boundary, appending an ellipsis when cut. */
export function truncate(s: string, max = 400): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * HTML/plain description → clean plain text, capped to keep rows bounded while
 * still holding enough for the detail panel. Cards show a shorter SQL substring.
 */
export function descriptionSnippet(input: string | null | undefined, max = 4000): string | null {
  const text = truncate(htmlToText(input), max)
  return text || null
}
