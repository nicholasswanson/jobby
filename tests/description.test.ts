import { describe, expect, it } from 'vitest'
import { parseDescription, type DescriptionBlock } from '@/lib/description'
import fixtures from './fixtures/descriptions.json'

const byType = (blocks: DescriptionBlock[], type: DescriptionBlock['type']) =>
  blocks.filter((b) => b.type === type)

describe('parseDescription (real stored descriptions)', () => {
  const spade = fixtures.find((f) => f.company === 'Spade')!
  const voize = fixtures.find((f) => f.company === 'voize')!

  it('turns ALL-CAPS section titles into headings, incl. ones ending in ? or !', () => {
    const heads = byType(parseDescription(spade.description), 'heading').map((h) => h.type === 'heading' && h.text)
    expect(heads).toContain('WHAT IS SPADE?')
    expect(heads).toContain('THE OPPORTUNITY')
    expect(heads).toContain('WHAT WILL YOU BE DOING?')
    const vheads = byType(parseDescription(voize.description), 'heading').map((h) => h.type === 'heading' && h.text)
    expect(vheads).toContain('WHY VOIZE? BECAUSE WE’RE MORE THAN JUST A JOB!')
    expect(vheads.some((h) => typeof h === 'string' && h.includes('YOUR DAILY BUSINESS'))).toBe(true)
  })

  it('groups "- " bullets separated by blank lines into one list', () => {
    const blocks = parseDescription(spade.description)
    const idx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'WHAT WILL YOU BE DOING?')
    const list = blocks[idx + 1]
    expect(list.type).toBe('list')
    if (list.type === 'list') {
      expect(list.items.length).toBeGreaterThanOrEqual(3)
      expect(list.items[0]).toMatch(/^Own 5-10 major enterprise/)
      expect(list.items[1]).toMatch(/^Build VP and C-suite/)
    }
  })

  it('keeps ordinary prose as paragraphs (a sentence is never a heading)', () => {
    const blocks = parseDescription(spade.description)
    expect(blocks[0]).toEqual({ type: 'heading', text: 'WHAT IS SPADE?' })
    expect(blocks[1].type).toBe('paragraph')
    if (blocks[1].type === 'paragraph') expect(blocks[1].text).toMatch(/^Financial institutions process/)
  })
})

describe('parseDescription (synthetic)', () => {
  it('a short line ending in ":" or introducing bullets is a heading', () => {
    expect(parseDescription('Requirements:\n• 5 years\n• SQL')).toEqual([
      { type: 'heading', text: 'Requirements:' },
      { type: 'list', items: ['5 years', 'SQL'] },
    ])
    expect(parseDescription('What you bring\n• Grit')).toEqual([
      { type: 'heading', text: 'What you bring' },
      { type: 'list', items: ['Grit'] },
    ])
  })
  it('a long line, or one ending in a period, is a paragraph', () => {
    expect(parseDescription('We are hiring.')).toEqual([{ type: 'paragraph', text: 'We are hiring.' }])
    const long = 'x'.repeat(81)
    expect(parseDescription(long)).toEqual([{ type: 'paragraph', text: long }])
  })
  it('joins wrapped lines inside a paragraph and splits on blank lines', () => {
    expect(parseDescription('one two\nthree.\n\nfour.')).toEqual([
      { type: 'paragraph', text: 'one two three.' },
      { type: 'paragraph', text: 'four.' },
    ])
  })
  it('handles empty input', () => {
    expect(parseDescription(null)).toEqual([])
    expect(parseDescription('')).toEqual([])
  })
})
