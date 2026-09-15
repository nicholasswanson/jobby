import { describe, expect, it } from 'vitest'
import { categorize, classifyLocation, filterJob, matchesTitle } from '@/lib/filters'

describe('matchesTitle — INCLUDE', () => {
  it.each([
    'Account Manager',
    'Account Executive',
    'Sales Development Representative',
    'SDR',
    'BDR',
    'Business Development Representative',
    'Customer Success Manager',
    'Sales Associate',
    'Inside Sales Representative',
    'Account Associate',
    'Junior Account Executive',
  ])('includes %s', (title) => {
    expect(matchesTitle(title)).toBe(true)
  })

  it.each(['Product Designer', 'Recruiter', 'Data Analyst', 'Office Manager'])(
    'excludes unrelated title %s',
    (title) => {
      expect(matchesTitle(title)).toBe(false)
    },
  )
})

describe('categorize (role feeds)', () => {
  it('routes AM titles to account_management', () => {
    expect(categorize('Account Manager')).toEqual(['account_management'])
    expect(categorize('Customer Success Manager')).toEqual(['account_management'])
  })
  it('routes sales titles to sales', () => {
    expect(categorize('Account Executive')).toEqual(['sales'])
    expect(categorize('Sales Development Representative')).toEqual(['sales'])
  })
  it('routes anything with engineer to engineering (takes precedence)', () => {
    expect(categorize('Software Engineer')).toEqual(['engineering'])
    expect(categorize('Customer Success Engineer')).toEqual(['engineering'])
    expect(categorize('Sales Engineer')).toEqual(['engineering'])
  })
  it('returns [] for non-target roles', () => {
    expect(categorize('Product Designer')).toEqual([])
  })
})

describe('matchesTitle — EXCLUDE (seniority / leadership / enterprise)', () => {
  it.each([
    'Sr. Account Executive', // mandated edge case
    'Senior Account Manager',
    'Staff Account Executive',
    'Principal Account Manager',
    'Director of Sales',
    'VP Sales',
    'Vice President, Sales',
    'Head of Sales',
    'Sales Team Lead',
    'Manager, Sales Operations',
    'Account Manager, Enterprise', // mandated edge case (docs-vs-spec fix)
    'Enterprise Account Executive', // original spec wording
  ])('excludes %s', (title) => {
    expect(matchesTitle(title)).toBe(false)
  })
})

describe('classifyLocation', () => {
  it('keeps fully remote as remote', () => {
    expect(classifyLocation('Remote')).toEqual({
      keep: true,
      remoteType: 'remote',
      verify: false,
    })
    expect(classifyLocation('Remote - Worldwide')).toMatchObject({ remoteType: 'remote' })
    expect(classifyLocation('Anywhere')).toMatchObject({ remoteType: 'remote' })
  })

  it('keeps US-restricted remote as remote_us, no verify flag (mandated edge case)', () => {
    expect(classifyLocation('Remote — US only')).toEqual({
      keep: true,
      remoteType: 'remote_us',
      verify: false,
    })
    expect(classifyLocation('Remote (US)')).toMatchObject({ remoteType: 'remote_us' })
    expect(classifyLocation('US-based, Remote')).toMatchObject({ remoteType: 'remote_us' })
  })

  it('keeps geo-hinted remote but flags for verification (Remote (SF)) — mandated edge case', () => {
    const r = classifyLocation('Remote (SF)')
    expect(r.keep).toBe(true)
    if (r.keep) expect(r.verify).toBe(true)
  })

  it('drops explicit on-site / hybrid with no remote signal', () => {
    expect(classifyLocation('Hybrid — New York, NY')).toEqual({ keep: false, reason: 'onsite' })
    expect(classifyLocation('On-site')).toEqual({ keep: false, reason: 'onsite' })
    expect(classifyLocation('In office, Austin')).toEqual({ keep: false, reason: 'onsite' })
  })

  it('keeps + flags remote+hybrid mixed listings rather than dropping', () => {
    const r = classifyLocation('Remote or Hybrid')
    expect(r.keep).toBe(true)
    if (r.keep) expect(r.verify).toBe(true)
  })

  it('keeps + flags ambiguous / bare-place / empty locations (false negatives are worse)', () => {
    for (const loc of ['', 'San Francisco, CA', null, undefined]) {
      const r = classifyLocation(loc)
      expect(r.keep).toBe(true)
      if (r.keep) expect(r.verify).toBe(true)
    }
  })
})

describe('filterJob (title + location combined)', () => {
  it('includes an early-career remote role with its category', () => {
    expect(filterJob({ title: 'Account Executive', location: 'Remote' })).toMatchObject({
      included: true,
      remoteType: 'remote',
      categories: ['sales'],
    })
  })

  it('drops a matching title at an on-site location, tagged onsite', () => {
    expect(filterJob({ title: 'Sales Associate', location: 'Hybrid, NYC' })).toMatchObject({
      included: false,
      relevant: true,
      reason: 'onsite',
    })
  })

  it('drops a senior title even when remote, tagged seniority', () => {
    expect(filterJob({ title: 'Senior Account Executive', location: 'Remote' })).toMatchObject({
      included: false,
      relevant: true,
      reason: 'seniority',
    })
  })

  it('marks a non-target title irrelevant (not stored)', () => {
    expect(filterJob({ title: 'Product Designer', location: 'Remote' })).toEqual({
      included: false,
      relevant: false,
    })
  })

  it('includes engineering roles in the engineering category', () => {
    expect(filterJob({ title: 'Customer Success Engineer', location: 'Remote' })).toMatchObject({
      included: true,
      categories: ['engineering'],
    })
  })
})

describe('non-North-America geo exclusion', () => {
  it.each([
    ['Account Executive, LATAM', 'Anywhere in the World'],
    ['Account Executive, Named - Germany', 'Anywhere in the World'],
    ['Account Executive, EMEA', 'Remote'],
    ['Account Manager, DACH', 'Remote'],
    ['Sales Development Representative, APAC', 'Remote'],
    ['Account Executive', 'Remote (EU)'],
    ['Account Executive', 'Remote - London'],
  ])('excludes %s / %s with reason geo', (title, location) => {
    expect(filterJob({ title, location })).toMatchObject({
      included: false,
      relevant: true,
      reason: 'geo',
    })
  })

  it.each([
    ['Account Executive, US', 'Remote'],
    ['Account Executive, North America', 'Remote'],
    ['Account Executive, Americas', 'Remote'],
    ['Account Manager, Canada', 'Remote'],
    ['Account Executive, AMER', 'Remote'],
  ])('keeps North-America role %s', (title, location) => {
    expect(filterJob({ title, location })).toMatchObject({ included: true })
  })
})

describe('experience-based seniority (description)', () => {
  it('excludes roles that require many years of experience', () => {
    expect(
      filterJob({
        title: 'Strategic Account Executive',
        location: 'Remote',
        description: '10+ years of experience in a customer-facing role such as Strategic Account Management.',
      }),
    ).toMatchObject({ included: false, relevant: true, reason: 'seniority' })
  })
  it('keeps early-career roles', () => {
    expect(
      filterJob({
        title: 'Account Executive',
        location: 'Remote',
        description: '2-3 years of sales experience preferred; eager to learn.',
      }),
    ).toMatchObject({ included: true })
  })
})
