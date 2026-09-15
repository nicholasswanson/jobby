import { describe, expect, it } from 'vitest'
import { classifyLocation, filterJob, matchesTitle } from '@/lib/filters'

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

  it.each(['Software Engineer', 'Product Designer', 'Recruiter', 'Data Analyst'])(
    'excludes unrelated title %s',
    (title) => {
      expect(matchesTitle(title)).toBe(false)
    },
  )
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
  it('includes an early-career remote role', () => {
    expect(filterJob({ title: 'Account Executive', location: 'Remote' })).toEqual({
      included: true,
      remoteType: 'remote',
      verify: false,
    })
  })

  it('drops a matching title at an on-site location', () => {
    expect(filterJob({ title: 'Sales Associate', location: 'Hybrid, NYC' })).toEqual({
      included: false,
    })
  })

  it('drops a senior title even when remote', () => {
    expect(filterJob({ title: 'Senior Account Executive', location: 'Remote' })).toEqual({
      included: false,
    })
  })
})
