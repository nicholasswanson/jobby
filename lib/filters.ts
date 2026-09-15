// ALL matching logic lives here (see AGENTS.md hard rule #2). No inline regexes
// in routes or normalizers. Every pattern change ships with a test in
// tests/filters.test.ts demonstrating why.
//
// Spec: technical_plan.md § Filters.

// --- Role categories ---------------------------------------------------------
// Each feed is a role category with its own title patterns. A title can match
// several — EXCEPT engineering, which takes precedence (a title containing
// "engineer" is a tech role, e.g. "Customer Success Engineer" → engineering,
// not account_management). Cross-cutting gates (seniority, experience, geo,
// location) below apply to every category.

export type RoleCategory = 'account_management' | 'sales' | 'engineering'

// Engineering is off for now (Erin's search is AM/sales only). Flip to true to
// re-enable the engineering feed — categorize() will tag software roles again,
// and it needs re-adding to INBOX_FEEDS (queries.ts) + FEEDS (FeedSwitcher.tsx).
export const ENGINEERING_ENABLED = false

// SOFTWARE/tech engineering only (what a tech job-seeker wants). Electronics /
// mechanical / hardware / "sales engineer" etc. are NOT this.
const SOFTWARE_PATTERN =
  /\bsoftware\b|software engineer|software developer|\bdeveloper\b|web developer|mobile (?:engineer|developer)|\bprogrammer\b|\bswe\b|full[-\s]?stack|back[-\s]?end|front[-\s]?end|\bdevops\b|\bsre\b|site reliability|platform engineer|infrastructure engineer|security engineer|data engineer|data scientist|machine learning|\bml\b engineer|\bai\b engineer|qa engineer|test engineer/i

// Any other "…engineer/engineering" title — electronics, mechanical, sales,
// customer-success engineer, etc. These are non-target technical roles.
const NON_SOFTWARE_ENGINEER = /\bengineer|\bengineering\b/i

export const ROLE_CATEGORIES: { key: RoleCategory; label: string; pattern: RegExp }[] = [
  {
    key: 'account_management',
    label: 'Account Management',
    pattern:
      /account manager|customer success|\bcsm\b|account associate|client partner|client success|relationship manager|implementation manager|onboarding manager|partner manager/i,
  },
  {
    key: 'sales',
    label: 'Sales',
    pattern:
      /account executive|\bae\b|sales development|(^|\W)sdr(\W|$)|(^|\W)bdr(\W|$)|business development|inside sales|sales associate|sales representative|sales rep\b/i,
  },
  { key: 'engineering', label: 'Engineering', pattern: SOFTWARE_PATTERN },
]

/**
 * Role categories a title belongs to.
 *  - Software/tech engineering → ['engineering'].
 *  - Any other "…engineer" title (electronics, mechanical, sales engineer,
 *    customer-success engineer) → [] (not a target role — keeps them out of AM
 *    and out of the engineering feed).
 *  - Otherwise, AM / sales matching.
 */
export function categorize(title: string): RoleCategory[] {
  if (SOFTWARE_PATTERN.test(title)) return ENGINEERING_ENABLED ? ['engineering'] : []
  if (NON_SOFTWARE_ENGINEER.test(title)) return []
  return ROLE_CATEGORIES.filter((c) => c.key !== 'engineering' && c.pattern.test(title)).map(
    (c) => c.key,
  )
}

// EXCLUDE (senior / leadership / enterprise) — applies to every category. Note
// (deviation, flagged per hard rule): broadened the plan's `enterprise account`
// to `\benterprise\b` so both "Enterprise Account Executive" and "Account
// Manager, Enterprise" are excluded.
export const EXCLUDE =
  /senior|\bsr\.?\b|staff|principal|director|vp\b|vice president|head of|lead\b|manager,\s*sales|\benterprise\b/i

/** Back-compat: does a title match any category and pass the seniority gate. */
export function matchesTitle(title: string): boolean {
  return categorize(title).length > 0 && !EXCLUDE.test(title)
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

// Roles that demand a lot of experience are too senior for an early-career search.
const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi
const SENIOR_YEARS = 6 // exclude when the description requires >= this many years

/** Max years-of-experience the description asks for (0 if none / not experience-related). */
export function maxExperienceYears(text: string | null | undefined): number {
  if (!text) return 0
  let max = 0
  for (const m of text.matchAll(YEARS_RE)) {
    const idx = m.index ?? 0
    const window = text.slice(Math.max(0, idx - 30), idx + 45).toLowerCase()
    // Only count numbers clearly about required experience (reduce false positives).
    if (/experience|exp\b|background|track record|selling|sales|account|success|professional|industry|relevant|minimum|at least/.test(window)) {
      const n = Number(m[1])
      if (n > max && n <= 40) max = n
    }
  }
  return max
}

export type FilterInput = { title: string; location?: string | null; description?: string | null }

// Why a matching-role job was excluded — surfaced in Settings › Filtered so the
// user can review and override false negatives.
export type FilterReason = 'seniority' | 'geo' | 'onsite'

export type FilterResult =
  // Not a target role in any category — not worth storing.
  | { included: false; relevant: false }
  // A target role excluded by a cross-cutting gate (kept for the review list).
  | { included: false; relevant: true; reason: FilterReason; categories: RoleCategory[] }
  | { included: true; remoteType: RemoteType; verify: boolean; categories: RoleCategory[] }

/**
 * Staged filter. First categorize the role; a non-matching title is irrelevant.
 * Then apply the cross-cutting gates (seniority, experience, geo, location) that
 * every category shares. The matched categories ride along for feed tagging.
 */
export function filterJob({ title, location, description }: FilterInput): FilterResult {
  const categories = categorize(title)
  if (categories.length === 0) return { included: false, relevant: false }
  if (EXCLUDE.test(title))
    return { included: false, relevant: true, reason: 'seniority', categories }
  if (maxExperienceYears(description) >= SENIOR_YEARS)
    return { included: false, relevant: true, reason: 'seniority', categories }
  if (isNonNorthAmerica(title, location))
    return { included: false, relevant: true, reason: 'geo', categories }
  const loc = classifyLocation(location)
  if (!loc.keep) return { included: false, relevant: true, reason: 'onsite', categories }
  return { included: true, remoteType: loc.remoteType, verify: loc.verify, categories }
}
