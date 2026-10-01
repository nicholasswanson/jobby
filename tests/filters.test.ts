import { describe, expect, it } from 'vitest'
import {
  categorize,
  classifyLocation,
  filterJob,
  getSearchProfile,
  matchesTitle,
  SEARCH_PROFILES,
} from '@/lib/filters'

// Erin's profile is the original search; every pre-existing assertion below is
// hers and unchanged in substance. Brodi's suite is at the bottom.
const erin = SEARCH_PROFILES.erin
const brodi = SEARCH_PROFILES.brodi

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
    expect(matchesTitle(title, erin)).toBe(true)
  })

  it.each(['Product Designer', 'Recruiter', 'Data Analyst', 'Office Manager'])(
    'excludes unrelated title %s',
    (title) => {
      expect(matchesTitle(title, erin)).toBe(false)
    },
  )
})

describe('categorize (role feeds)', () => {
  it('routes AM titles to account_management', () => {
    expect(categorize('Account Manager', erin)).toEqual(['account_management'])
    expect(categorize('Customer Success Manager', erin)).toEqual(['account_management'])
  })
  it('routes sales titles to sales', () => {
    expect(categorize('Account Executive', erin)).toEqual(['sales'])
    expect(categorize('Sales Development Representative', erin)).toEqual(['sales'])
  })
  it('drops software roles while engineering is off (ENGINEERING_ENABLED=false)', () => {
    expect(categorize('Software Engineer', erin)).toEqual([])
    expect(categorize('Backend Engineer', erin)).toEqual([])
    expect(categorize('Data Scientist', erin)).toEqual([])
    expect(categorize('DevOps Engineer', erin)).toEqual([])
  })
  it('drops non-software engineers entirely (not a target role)', () => {
    expect(categorize('Electronics Engineer', erin)).toEqual([])
    expect(categorize('Mechanical Engineer', erin)).toEqual([])
    expect(categorize('Sales Engineer', erin)).toEqual([])
    expect(categorize('Customer Success Engineer', erin)).toEqual([]) // keeps it out of AM too
  })
  it('returns [] for non-target roles', () => {
    expect(categorize('Product Designer', erin)).toEqual([])
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
    expect(matchesTitle(title, erin)).toBe(false)
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
    expect(filterJob({ title: 'Account Executive', location: 'Remote' }, erin)).toMatchObject({
      included: true,
      remoteType: 'remote',
      categories: ['sales'],
    })
  })

  it('drops a matching title at an on-site location, tagged onsite', () => {
    expect(filterJob({ title: 'Sales Associate', location: 'Hybrid, NYC' }, erin)).toMatchObject({
      included: false,
      relevant: true,
      reason: 'onsite',
    })
  })

  it('drops a senior title even when remote, tagged seniority', () => {
    expect(filterJob({ title: 'Senior Account Executive', location: 'Remote' }, erin)).toMatchObject({
      included: false,
      relevant: true,
      reason: 'seniority',
    })
  })

  it('marks a non-target title irrelevant (not stored)', () => {
    expect(filterJob({ title: 'Product Designer', location: 'Remote' }, erin)).toEqual({
      included: false,
      relevant: false,
    })
  })

  it('drops software roles as irrelevant while engineering is off', () => {
    expect(filterJob({ title: 'Software Engineer', location: 'Remote' }, erin)).toEqual({
      included: false,
      relevant: false,
    })
  })

  it('drops non-software engineers as irrelevant', () => {
    expect(filterJob({ title: 'Electronics Engineer', location: 'United States' }, erin)).toEqual({
      included: false,
      relevant: false,
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
    ['Customer Success Manager Mexico', 'Mexico City, Mexico - Remote'],
    ['Customer Success Manager', 'Tel Aviv'],
  ])('excludes %s / %s with reason geo', (title, location) => {
    expect(filterJob({ title, location }, erin)).toMatchObject({
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
    expect(filterJob({ title, location }, erin)).toMatchObject({ included: true })
  })
})

describe('experience-based seniority (description)', () => {
  it('excludes roles that require many years of experience', () => {
    expect(
      filterJob({
        title: 'Strategic Account Executive',
        location: 'Remote',
        description: '10+ years of experience in a customer-facing role such as Strategic Account Management.',
      }, erin),
    ).toMatchObject({ included: false, relevant: true, reason: 'seniority' })
  })
  it('keeps early-career roles', () => {
    expect(
      filterJob({
        title: 'Account Executive',
        location: 'Remote',
        description: '2-3 years of sales experience preferred; eager to learn.',
      }, erin),
    ).toMatchObject({ included: true })
  })
})

// --- Brodi: enterprise / strategic customer success (IC + leadership) ----------
// Built from his résumé (8+ yrs; Strategic TAM at Rippling; led a CSM team at
// GoDaddy). Erin's seniority gate is exactly what he wants to see.

describe('Brodi — INCLUDE (senior IC + CS leadership)', () => {
  it.each([
    ['Enterprise Customer Success Manager', 'enterprise_cs'],
    ['Senior Customer Success Manager', 'enterprise_cs'],
    ['Principal Customer Success Manager', 'enterprise_cs'],
    ['Strategic Account Manager', 'enterprise_cs'],
    ['Technical Account Manager', 'enterprise_cs'],
    ['Account Manager, Enterprise', 'enterprise_cs'],
    ['Customer Success Manager', 'enterprise_cs'],
    ['Manager, Customer Success', 'cs_leadership'],
    ['Manager of Customer Success', 'cs_leadership'],
    ['Head of Customer Success', 'cs_leadership'],
    ['Director of Customer Success', 'cs_leadership'],
    ['Director, Account Management', 'cs_leadership'],
    ['Customer Success Team Lead', 'cs_leadership'],
    ['Head of Sales and Customer Success', 'cs_leadership'],
    ['Key Account Manager', 'enterprise_cs'],
    ['Director of Strategic Accounts', 'enterprise_cs'],
    ['Strategic Account Partner', 'enterprise_cs'],
    ['Account Manager - Health Systems', 'enterprise_cs'], // "systems" in a vertical, not CS-ops
  ])('includes %s in %s', (title, feed) => {
    expect(matchesTitle(title, brodi)).toBe(true)
    expect(categorize(title, brodi)).toContain(feed)
  })

  it('keeps the IC title "Customer Success Manager" out of the leadership feed', () => {
    expect(categorize('Customer Success Manager', brodi)).toEqual(['enterprise_cs'])
    expect(categorize('Senior Customer Success Manager', brodi)).toEqual(['enterprise_cs'])
  })
})

describe('Brodi — EXCLUDE (entry-level, support, SMB/scaled, VP+)', () => {
  it.each([
    'Customer Success Associate',
    'Junior Account Manager',
    'Customer Success Specialist',
    'Customer Success Coordinator',
    'Customer Success Intern',
    'Sales Development Representative',
    'Customer Support Manager',
    'Customer Success Manager, SMB',
    'Scaled Customer Success Manager',
    'VP Customer Success',
    'Vice President, Customer Success',
    'Chief Customer Officer',
    'Customer Success Operations Manager', // internal CS ops / tooling
    'Customer Success Systems Manager',
    'Senior Google Ads Account Manager', // agency / ad-account management
    'Account Director, Public Relations',
  ])('excludes %s', (title) => {
    expect(matchesTitle(title, brodi)).toBe(false)
  })

  it.each([
    'Strategic Account Executive', // quota-carrying sales, not post-sale
    'Key Account Executive',
    'Account Director', // enterprise-AE / agency title
    'Senior Director, Technical Accounting', // finance — "technical account" must not match
  ])('never matches a Brodi feed: %s', (title) => {
    expect(categorize(title, brodi)).toEqual([])
  })

  it('tags a gated title with reason seniority (shown as the review reason)', () => {
    expect(filterJob({ title: 'Customer Success Associate', location: 'Remote' }, brodi)).toMatchObject({
      included: false,
      relevant: true,
      reason: 'seniority',
    })
  })
})

describe('Brodi — irrelevant titles are not stored', () => {
  it.each(['Account Executive', 'Sales Development Representative Lead', 'Customer Success Engineer', 'Product Designer'])(
    '%s is irrelevant',
    (title) => {
      // SDR is excluded-by-gate only if it matched a feed; "Account Executive"
      // and engineers never match his feeds at all.
      const r = filterJob({ title, location: 'Remote' }, brodi)
      if (title === 'Sales Development Representative Lead') {
        expect(r.included).toBe(false)
      } else {
        expect(r).toEqual({ included: false, relevant: false })
      }
    },
  )
})

describe('Brodi — experience window (description)', () => {
  it('drops roles asking for only 1-2 years as too junior', () => {
    expect(
      filterJob(
        {
          title: 'Customer Success Manager',
          location: 'Remote',
          description: 'Requirements: 1-2 years of experience in customer success or account management.',
        },
        brodi,
      ),
    ).toMatchObject({ included: false, relevant: true, reason: 'junior' })
  })
  it('keeps roles asking for 8+ years (Erin would drop these)', () => {
    const input = {
      title: 'Strategic Account Manager',
      location: 'Remote',
      description: '8+ years of experience managing enterprise accounts; renewals and expansion.',
    }
    expect(filterJob(input, brodi)).toMatchObject({ included: true, categories: ['enterprise_cs'] })
    expect(filterJob(input, erin)).toMatchObject({ included: false, reason: 'seniority' })
  })
  it('drops VP-tier asks of 15+ years as too senior', () => {
    expect(
      filterJob(
        { title: 'Customer Success Manager', location: 'Remote', description: '15+ years of experience leading customer success.' },
        brodi,
      ),
    ).toMatchObject({ included: false, reason: 'seniority' })
  })
  it('counts years phrased as "N years in a customer-facing role" (keyword window)', () => {
    expect(
      filterJob(
        {
          title: 'Strategic Customer Success Manager (Founding)',
          location: 'Remote',
          description: '4–7 years in a technical, customer-facing role. At least 2+ years of tenure at one company.',
        },
        brodi,
      ),
    ).toMatchObject({ included: true })
  })
  it('shares the geo + on-site gates with Erin', () => {
    expect(filterJob({ title: 'Enterprise Customer Success Manager, EMEA', location: 'Remote' }, brodi)).toMatchObject({
      reason: 'geo',
    })
    expect(filterJob({ title: 'Enterprise Customer Success Manager', location: 'Hybrid — NYC' }, brodi)).toMatchObject({
      reason: 'onsite',
    })
  })
})

describe('profiles split the same posting (why one row per profile exists)', () => {
  it('"Account Manager, Enterprise" / Remote: Erin filters it, Brodi gets it', () => {
    const input = { title: 'Account Manager, Enterprise', location: 'Remote' }
    expect(filterJob(input, erin)).toMatchObject({ included: false, relevant: true, reason: 'seniority' })
    expect(filterJob(input, brodi)).toMatchObject({ included: true, categories: ['enterprise_cs'] })
  })
  it('"Customer Success Manager" / Remote: both get it, in their own feeds', () => {
    const input = { title: 'Customer Success Manager', location: 'Remote' }
    expect(filterJob(input, erin)).toMatchObject({ included: true, categories: ['account_management'] })
    expect(filterJob(input, brodi)).toMatchObject({ included: true, categories: ['enterprise_cs'] })
  })
  it('getSearchProfile falls back to Erin for unknown keys', () => {
    expect(getSearchProfile('nobody').key).toBe('erin')
    expect(getSearchProfile('brodi').key).toBe('brodi')
  })
})
