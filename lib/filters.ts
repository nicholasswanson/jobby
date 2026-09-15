// ALL matching logic lives here (see AGENTS.md hard rule #2). No inline regexes
// in routes or normalizers. Every pattern change ships with a test in
// tests/filters.test.ts demonstrating why.
//
// Spec: technical_plan.md § Filters.

// --- Title matching ----------------------------------------------------------

// A title must match at least one INCLUDE pattern (early-career AM/sales roles)...
export const INCLUDE =
  /account manager|account executive|sales development|(^|\W)sdr(\W|$)|(^|\W)bdr(\W|$)|business development rep|customer success|sales associate|inside sales|account associate/i

// ...and match NONE of the EXCLUDE patterns (senior / leadership / enterprise).
//
// NOTE (deviation from technical_plan.md, flagged per hard rule): the plan's
// EXCLUDE listed `enterprise account`, which only catches "Enterprise Account
// Executive" — not "Account Manager, Enterprise", which AGENTS.md and
// implementation_plan.md both require to be excluded. Broadened to `\benterprise\b`
// so both orderings are excluded. Covered by tests.
export const EXCLUDE =
  /senior|\bsr\.?\b|staff|principal|director|vp\b|vice president|head of|lead\b|manager,\s*sales|\benterprise\b/i

export function matchesTitle(title: string): boolean {
  return INCLUDE.test(title) && !EXCLUDE.test(title)
}

// --- Location classification -------------------------------------------------

export type RemoteType = 'remote' | 'remote_us' | 'remote_restricted'

export type LocationResult =
  | { keep: true; remoteType: RemoteType; verify: boolean }
  | { keep: false; reason: 'onsite' }

const ONSITE = /hybrid|on-?site|in.?office/i
const REMOTE = /remote|anywhere|worldwide|distributed/i
// US restriction signals.
const US_ONLY = /\bu\.?s\.?a?\.?\b|united states|\bus[-\s]?only\b|\bus[-\s]?based\b/i
// A parenthetical or trailing city/region hint on an otherwise-remote listing,
// e.g. "Remote (SF)" or "Remote - Berlin" — kept but flagged for a human look.
const PLACE_HINT = /\(|,|—|–|\bor\b|\//

/**
 * Classify a raw location string.
 *
 * Guiding principle (technical_plan.md): false negatives are worse than an
 * occasional bad card, so anything ambiguous is KEPT and badged `verify` rather
 * than silently dropped. Only explicit on-site / hybrid postings with no remote
 * signal are dropped.
 */
export function classifyLocation(raw: string | null | undefined): LocationResult {
  const location = (raw ?? '').trim()

  const isRemote = REMOTE.test(location)
  const isOnsite = ONSITE.test(location)

  if (isRemote) {
    // Remote + hybrid/on-site language → genuinely mixed; keep and flag.
    if (isOnsite) return { keep: true, remoteType: 'remote_restricted', verify: true }
    if (US_ONLY.test(location)) return { keep: true, remoteType: 'remote_us', verify: false }
    // "Remote (SF)", "Remote - EU", "Remote, Canada" → remote but geo-hinted; flag.
    if (PLACE_HINT.test(location))
      return { keep: true, remoteType: 'remote_restricted', verify: true }
    // Plainly remote / worldwide / anywhere.
    return { keep: true, remoteType: 'remote', verify: false }
  }

  // No remote signal.
  if (isOnsite) return { keep: false, reason: 'onsite' }

  // Empty or a bare place with no remote/on-site keyword → ambiguous. Keep + flag.
  return { keep: true, remoteType: 'remote_restricted', verify: true }
}

// --- Combined ----------------------------------------------------------------

export type FilterInput = { title: string; location?: string | null }
export type FilterResult =
  | { included: false }
  | { included: true; remoteType: RemoteType; verify: boolean }

/** Apply the title filter, then classify location. */
export function filterJob({ title, location }: FilterInput): FilterResult {
  if (!matchesTitle(title)) return { included: false }
  const loc = classifyLocation(location)
  if (!loc.keep) return { included: false }
  return { included: true, remoteType: loc.remoteType, verify: loc.verify }
}
