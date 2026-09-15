import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeGreenhouse } from '@/lib/sources/greenhouse'
import { normalizeLever } from '@/lib/sources/lever'
import { normalizeAshby } from '@/lib/sources/ashby'
import { normalizeRemotive } from '@/lib/sources/remotive'
import { normalizeWwr } from '@/lib/sources/wwr'
import { normalizeRemoteOK } from '@/lib/sources/remoteok'
import { normalizeWorkingNomads } from '@/lib/sources/workingnomads'
import { normalizeHimalayas } from '@/lib/sources/himalayas'

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

describe('normalizeRemoteOK (aggregator)', () => {
  const out = normalizeRemoteOK([
    { legal: 'notice, no position' },
    {
      id: 123,
      company: 'Acme',
      position: 'Account Executive',
      location: 'US Remote',
      description: '<p>Sell things.</p>',
      url: 'https://remoteok.com/remote-jobs/123',
      date: '2026-09-14T00:00:00+00:00',
      salary_min: 70000,
      salary_max: 90000,
    },
  ])
  it('skips the legal-notice element and maps a job', () => {
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      externalId: '123',
      title: 'Account Executive',
      companyName: 'Acme',
      location: 'US Remote',
      salaryText: '$70k–$90k',
    })
    expect(out[0].description).toBe('Sell things.')
  })
})

describe('normalizeWorkingNomads (aggregator)', () => {
  const out = normalizeWorkingNomads([
    {
      url: 'https://www.workingnomads.com/jobs/x',
      title: 'Sales Development Representative',
      company_name: 'Globex',
      location: 'Anywhere',
      description: '<p>Prospect accounts.</p>',
      pub_date: '2026-09-13T00:00:00Z',
    },
  ])
  it('maps a job with company + location', () => {
    expect(out[0]).toMatchObject({
      title: 'Sales Development Representative',
      companyName: 'Globex',
      location: 'Anywhere',
    })
    expect(out[0].description).toBe('Prospect accounts.')
  })
})

describe('normalizeHimalayas (aggregator)', () => {
  const out = normalizeHimalayas([
    {
      title: 'Account Manager',
      companyName: 'Initech',
      applicationLink: 'https://himalayas.app/jobs/y',
      guid: 555,
      locationRestrictions: ['United States', 'Canada'],
      description: '<p>Own accounts.</p>',
      pubDate: 1780000000,
      minSalary: 60000,
      maxSalary: 80000,
    },
  ])
  it('joins location restrictions and parses epoch pubDate', () => {
    expect(out[0]).toMatchObject({
      externalId: '555',
      title: 'Account Manager',
      companyName: 'Initech',
      location: 'United States, Canada',
      salaryText: '$60k–$80k',
    })
    expect(out[0].postedAt).toBeInstanceOf(Date)
    expect(out[0].postedAt?.getUTCFullYear()).toBe(2026)
  })
})
