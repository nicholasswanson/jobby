// Turn a stored plain-text job description (see lib/text.ts: newlines kept,
// bullets marked "• ") into blocks the panel can render with real structure.
// Pure + unit-tested (tests/description.test.ts). The text itself is untrusted
// crawled content: we only group lines, never interpret them.

export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

const BULLET = /^[•\-–*·▪◦]\s+/
const MAX_HEADING_LEN = 80

function isBullet(line: string): boolean {
  return BULLET.test(line)
}

function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim()
}

/**
 * A short line with no sentence-ending punctuation that is ALL CAPS, ends with
 * a colon, or directly introduces a bullet list reads as a section heading.
 */
function isHeading(line: string, next: string | undefined): boolean {
  if (line.length > MAX_HEADING_LEN) return false
  // ALL CAPS reads as a heading even with "?" or "!" ("WHAT IS SPADE?").
  const letters = line.replace(/[^a-z]/gi, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true
  if (/[.!?]$/.test(line)) return false
  if (line.endsWith(':')) return true
  if (next != null && isBullet(next)) return true
  return false
}

/** Index of the next non-empty line at or after `from`, or -1. */
function nextNonEmpty(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) if (lines[i]) return i
  return -1
}

export function parseDescription(text: string | null | undefined): DescriptionBlock[] {
  if (!text) return []
  const lines = text.split('\n').map((l) => l.trim())
  const blocks: DescriptionBlock[] = []
  let para: string[] = []
  let list: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'paragraph', text: para.join(' ') })
    para = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) {
      flushPara()
      // Bullets separated by blank lines are still one list.
      const n = nextNonEmpty(lines, i + 1)
      if (n === -1 || !isBullet(lines[n])) flushList()
      continue
    }
    if (isBullet(line)) {
      flushPara()
      list.push(stripBullet(line))
      continue
    }
    flushList()
    // Only a line standing on its own (paragraph not in progress) can be a heading.
    const n = nextNonEmpty(lines, i + 1)
    if (para.length === 0 && isHeading(line, n === -1 ? undefined : lines[n])) {
      blocks.push({ type: 'heading', text: line })
      continue
    }
    para.push(line)
  }
  flushPara()
  flushList()
  return blocks
}
