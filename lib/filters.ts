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

// Clear non-North-America geo indicators. When one of these appears in a title
// or location, the role is region-locked outside NA (US/Canada) and is excluded
// — e.g. "Account Executive, LATAM", "Account Executive, Named - Germany",
// "Remote (EU)". NA terms (US, USA, Canada, North America, Americas, AMER) are
// deliberately absent so they stay included.
export const NON_NA_GEO =
  /\b(latam|latin america|emea|apac|\bapj\b|anz|dach|mena|benelux|nordics?|iberia|europe|european|\beu\b|\buk\b|united kingdom|great britain|britain|ireland|germany|france|spain|italy|portugal|netherlands|belgium|luxembourg|switzerland|austria|poland|czech|romania|hungary|greece|sweden|denmark|norway|finland|iceland|turkey|ukraine|russia|middle east|israel|\buae\b|dubai|saudi|qatar|africa|nigeria|kenya|egypt|morocco|asia|\bapac\b|india|china|hong kong|taiwan|japan|korea|singapore|malaysia|indonesia|thailand|vietnam|philippines|pakistan|bangladesh|australia|new zealand|oceania|brazil|argentina|colombia|chile|peru|london|berlin|munich|paris|amsterdam|dublin|madrid|barcelona|lisbon|milan|zurich|stockholm|warsaw|bangalore|bengaluru|mumbai|delhi|hyderabad|sydney|melbourne|tokyo|seoul|s[aã]o paulo)\b/i

/** True when a title or location clearly restricts the role outside North America. */
export function isNonNorthAmerica(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && NON_NA_GEO.test(t))
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

// Why a matching-role job was excluded — surfaced in Settings › Filtered so the
// user can review and override false negatives.
export type FilterReason = 'seniority' | 'geo' | 'onsite'

export type FilterResult =
  // Not a target role at all — not worth storing.
  | { included: false; relevant: false }
  // A target role (title matched INCLUDE) but excluded by a later gate.
  | { included: false; relevant: true; reason: FilterReason }
  | { included: true; remoteType: RemoteType; verify: boolean }

/**
 * Staged filter. Order matters: first decide whether the title is even a target
 * role, then apply seniority, geo, and location gates. Relevant-but-excluded
 * jobs carry a reason so they can be reviewed later.
 */
// Engineering / technical roles that can slip through INCLUDE (e.g. "Customer
// Success Engineer", "Sales Engineer") — not target AM/sales roles, so drop them
// entirely (not even worth surfacing in the filtered-review list).
export const ENGINEERING =
  /\bengineer|\bengineering\b|\bdeveloper\b|\bsoftware\b|\bprogrammer\b|\bswe\b|data scientist|machine learning engineer/i

export function filterJob({ title, location }: FilterInput): FilterResult {
  if (!INCLUDE.test(title)) return { included: false, relevant: false }
  if (ENGINEERING.test(title)) return { included: false, relevant: false }
  if (EXCLUDE.test(title)) return { included: false, relevant: true, reason: 'seniority' }
  if (isNonNorthAmerica(title, location))
    return { included: false, relevant: true, reason: 'geo' }
  const loc = classifyLocation(location)
  if (!loc.keep) return { included: false, relevant: true, reason: 'onsite' }
  return { included: true, remoteType: loc.remoteType, verify: loc.verify }
}
