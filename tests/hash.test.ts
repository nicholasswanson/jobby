import { describe, expect, it } from 'vitest'
import { dedupeHash } from '@/lib/hash'
import { getPacificHour, isOvernightPacific } from '@/lib/time'

describe('dedupeHash', () => {
  it('is stable and case/whitespace-insensitive', () => {
    const a = dedupeHash(42, 'Account Executive', 'Remote')
    const b = dedupeHash(42, '  account executive ', ' REMOTE ')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('differs by company, title, and location', () => {
    const base = dedupeHash(1, 'SDR', 'Remote')
    expect(dedupeHash(2, 'SDR', 'Remote')).not.toBe(base)
    expect(dedupeHash(1, 'BDR', 'Remote')).not.toBe(base)
    expect(dedupeHash(1, 'SDR', 'Remote - US')).not.toBe(base)
  })
  it('treats null and empty location the same', () => {
    expect(dedupeHash(1, 'SDR', null)).toBe(dedupeHash(1, 'SDR', ''))
  })
})

describe('overnight gate (America/Los_Angeles)', () => {
  // Pick UTC instants and assert the PT hour. PDT (summer) = UTC-7.
  it('computes the Pacific hour', () => {
    // 2026-09-14 13:00:00Z -> 06:00 PDT
    expect(getPacificHour(new Date('2026-09-14T13:00:00Z'))).toBe(6)
    // 2026-09-14 07:00:00Z -> 00:00 PDT
    expect(getPacificHour(new Date('2026-09-14T07:00:00Z'))).toBe(0)
  })

  it('skips overnight (23:00–05:59 PT) and runs during the day', () => {
    // 06:00 PDT -> active
    expect(isOvernightPacific(new Date('2026-09-14T13:00:00Z'))).toBe(false)
    // 22:59 PDT (05:59Z next day) -> active
    expect(isOvernightPacific(new Date('2026-09-15T05:59:00Z'))).toBe(false)
    // 23:00 PDT (06:00Z next day) -> overnight
    expect(isOvernightPacific(new Date('2026-09-15T06:00:00Z'))).toBe(true)
    // 00:00 PDT -> overnight
    expect(isOvernightPacific(new Date('2026-09-14T07:00:00Z'))).toBe(true)
    // 05:59 PDT -> overnight
    expect(isOvernightPacific(new Date('2026-09-14T12:59:00Z'))).toBe(true)
  })
})
