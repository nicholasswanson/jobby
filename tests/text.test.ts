import { describe, expect, it } from 'vitest'
import { descriptionSnippet, htmlToText, truncate } from '@/lib/text'

describe('htmlToText', () => {
  it('strips real HTML tags and decodes entities', () => {
    expect(htmlToText('<p>Hello &amp; welcome to <b>Acme</b></p>')).toBe('Hello & welcome to Acme')
  })
  it('handles HTML-escaped payloads (Greenhouse content)', () => {
    expect(htmlToText('&lt;p&gt;Join &lt;strong&gt;us&lt;/strong&gt;&lt;/p&gt;')).toBe('Join us')
  })
  it('collapses whitespace and inserts spaces at block boundaries', () => {
    expect(htmlToText('<li>One</li><li>Two</li>')).toBe('One Two')
  })
  it('returns empty string for null/undefined/empty', () => {
    expect(htmlToText(null)).toBe('')
    expect(htmlToText(undefined)).toBe('')
    expect(htmlToText('')).toBe('')
  })
})

describe('truncate', () => {
  it('leaves short strings intact', () => {
    expect(truncate('short', 400)).toBe('short')
  })
  it('cuts on a word boundary with an ellipsis', () => {
    const out = truncate('the quick brown fox jumps', 12)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(13)
  })
})

describe('descriptionSnippet', () => {
  it('returns null when there is no text', () => {
    expect(descriptionSnippet('<p></p>')).toBeNull()
    expect(descriptionSnippet(null)).toBeNull()
  })
  it('produces a clean snippet from HTML', () => {
    expect(descriptionSnippet('<p>Great <em>remote</em> role.</p>')).toBe('Great remote role.')
  })
})
