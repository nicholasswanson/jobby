import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeGreenhouse } from '@/lib/sources/greenhouse'
import { normalizeLever } from '@/lib/sources/lever'
import { normalizeAshby } from '@/lib/sources/ashby'
import { normalizeRemotive } from '@/lib/sources/remotive'
import { normalizeWwr } from '@/lib/sources/wwr'

function fixture(name: string): string {
  const url = new URL(`./fixtures/${name}`, import.meta.url)
  return readFileSync(fileURLToPath(url), 'utf8')
}
function json(name: string): unknown {
  return JSON.parse(fixture(name))
}

describe('normalizeGreenhouse', () => {
  const out = normalizeGreenhouse(json('greenhouse.json'))

  it('maps every job', () => {
    expect(out).toHaveLength(3)
  })
  it('maps id, title, url, location', () => {
    expect(out[0]).toMatchObject({
      externalId: '5501001',
      title: 'Account Executive',
      location: 'Remote - US',
      url: 'https://boards.greenhouse.io/acmeai/jobs/5501001',
    })
  })
  it('extracts salary from metadata', () => {
    expect(out[0].salaryText).toBe('$70,000 - $90,000 OTE')
    expect(out[1].salaryText).toBeNull()
  })
  it('parses updated_at into a Date', () => {
    expect(out[0].postedAt).toBeInstanceOf(Date)
    expect(out[0].postedAt?.getUTCFullYear()).toBe(2026)
  })
  it('decodes HTML-escaped content into plain text', () => {
    expect(out[0].description).toBe('Join our sales team and grow your career.')
  })
})

describe('normalizeLever', () => {
  const out = normalizeLever(json('lever.json'))

  it('maps every posting', () => {
    expect(out).toHaveLength(3)
  })
  it('maps title from `text` and location from categories', () => {
    expect(out[0]).toMatchObject({
      externalId: '8f2a1c00-1111-4a2b-9c3d-000000000001',
      title: 'Account Manager',
      location: 'Remote — US only',
      url: 'https://jobs.lever.co/novaml/8f2a1c00-1111-4a2b-9c3d-000000000001',
    })
  })
  it('formats a salary range', () => {
    expect(out[0].salaryText).toBe('USD 65,000–85,000 / per year salary')
  })
  it('falls back to allLocations when location is absent', () => {
    expect(out[2].location).toBe('Remote (Canada), Remote (US)')
  })
  it('parses epoch-ms createdAt into a Date', () => {
    expect(out[0].postedAt).toBeInstanceOf(Date)
    expect(out[0].postedAt?.getTime()).toBe(1757520000000)
  })
})

describe('normalizeAshby', () => {
  const out = normalizeAshby(json('ashby.json'))

  it('maps every job', () => {
    expect(out).toHaveLength(3)
  })
  it('uses jobUrl and compensation summary', () => {
    expect(out[0]).toMatchObject({
      externalId: 'a1b2c3d4-0001-0001-0001-000000000001',
      title: 'Customer Success Associate',
      location: 'Remote',
      salaryText: '$60K – $75K',
      url: 'https://jobs.ashbyhq.com/orbit/a1b2c3d4-0001-0001-0001-000000000001',
    })
  })
  it('joins secondary locations and falls back to isRemote', () => {
    expect(out[2].location).toBe('Remote (EU)')
    expect(out[2].salaryText).toBeNull()
  })
  it('strips HTML from the description', () => {
    expect(out[0].description).toBe('Own customer success for our SMB segment.')
  })
})

describe('normalizeRemotive (aggregator)', () => {
  const out = normalizeRemotive(json('remotive.json'))

  it('carries company name and defaults blank location to Remote', () => {
    expect(out[0]).toMatchObject({
      externalId: '990001',
      title: 'Account Associate',
      companyName: 'Bright Labs',
      location: 'USA Only',
      salaryText: '$55,000 - $70,000',
    })
    expect(out[2].location).toBe('Remote')
    expect(out[2].salaryText).toBeNull()
  })
})

describe('normalizeWwr (aggregator, RSS)', () => {
  const out = normalizeWwr(fixture('wwr.xml'))

  it('splits "Company: Title" and reads region + link', () => {
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({
      companyName: 'Peakflow',
      title: 'Sales Development Representative',
      location: 'USA Only',
      url: 'https://weworkremotely.com/remote-jobs/peakflow-sales-development-representative',
    })
  })
  it('decodes HTML entities in the company name', () => {
    expect(out[2].companyName).toBe('Driftwood & Co')
    expect(out[2].title).toBe('Customer Success Manager')
    expect(out[2].location).toBeNull()
  })
  it('parses pubDate into a Date', () => {
    expect(out[0].postedAt).toBeInstanceOf(Date)
    expect(out[0].postedAt?.getUTCFullYear()).toBe(2026)
  })
})
