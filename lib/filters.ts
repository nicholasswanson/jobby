// ALL matching logic lives here (see AGENTS.md hard rule #2). No inline regexes
// in routes or normalizers. Every pattern change ships with a test in
// tests/filters.test.ts demonstrating why.
//
// Spec: technical_plan.md § Filters.

// --- Search profiles ---------------------------------------------------------
// Each person using Jobby has a search profile: their own role feeds (title
// patterns), their own seniority gate, and their own experience-years window.
// The crawl evaluates every posting against every profile and stores one job
// row per (posting, profile). Cross-cutting gates (engineer, geo, location)
// below are shared by every profile.

export type ProfileKey = 'erin' | 'brodi'

export type RoleCategory =
  | 'account_management'
  | 'sales'
  | 'engineering'
  | 'enterprise_cs'
  | 'cs_leadership'

export type RoleFeed = { key: RoleCategory; label: string; pattern: RegExp }

export type SearchProfile = {
  key: ProfileKey
  label: string
  blurb: string
  feeds: RoleFeed[]
  /** Title gate: a matching-feed title is excluded (reason 'seniority') when it matches. */
  exclude: RegExp
  /** Description asks for fewer years than this → reason 'junior'. 0 disables. */
  minYears: number
  /** Description asks for at least this many years → reason 'seniority'. */
  maxYears: number
}

// Engineering is off for now (neither search is a tech search). Flip to true to
// re-enable the engineering feed — categorize() will tag software roles again;
// add an `engineering` feed to the profile(s) that want it.
export const ENGINEERING_ENABLED = false

// SOFTWARE/tech engineering only (what a tech job-seeker wants). Electronics /
// mechanical / hardware / "sales engineer" etc. are NOT this.
const SOFTWARE_PATTERN =
  /\bsoftware\b|software engineer|software developer|\bdeveloper\b|web developer|mobile (?:engineer|developer)|\bprogrammer\b|\bswe\b|full[-\s]?stack|back[-\s]?end|front[-\s]?end|\bdevops\b|\bsre\b|site reliability|platform engineer|infrastructure engineer|security engineer|data engineer|data scientist|machine learning|\bml\b engineer|\bai\b engineer|qa engineer|test engineer/i

// Any other "…engineer/engineering" title — electronics, mechanical, sales,
// customer-success engineer, etc. These are non-target technical roles.
const NON_SOFTWARE_ENGINEER = /\bengineer|\bengineering\b/i

const ENGINEERING_FEED: RoleFeed = {
  key: 'engineering',
  label: 'Engineering',
  pattern: SOFTWARE_PATTERN,
}

// --- Erin: early-career remote AM / sales -----------------------------------
// EXCLUDE (senior / leadership / enterprise). Note (deviation, flagged per hard
// rule): broadened the plan's `enterprise account` to `\benterprise\b` so both
// "Enterprise Account Executive" and "Account Manager, Enterprise" are excluded.
const ERIN: SearchProfile = {
  key: 'erin',
  label: 'Erin',
  blurb: 'Entry-level remote account management & sales',
  feeds: [
    {
      key: 'account_management',
      label: 'Account Management',
      pattern:
        /account manager|customer success|\bcsm\b|account associate|client partner|client success|relationship manager|implementation manager|onboarding manager|partner manager/i,
    },
    {
      key: 'sales',
      label: 'Entry-level Sales',
      pattern:
        /account executive|\bae\b|sales development|(^|\W)sdr(\W|$)|(^|\W)bdr(\W|$)|business development|inside sales|sales associate|sales representative|sales rep\b/i,
    },
  ],
  exclude:
    /senior|\bsr\.?\b|staff|principal|director|vp\b|vice president|head of|lead\b|manager,\s*sales|\benterprise\b/i,
  minYears: 0,
  maxYears: 6,
}

// --- Brodi: enterprise / strategic customer success, IC + leadership ---------
// Built from his résumé: 8+ yrs; Strategic Technical Account Manager (Rippling),
// Manager of Customer Success leading a CSM team (GoDaddy), enterprise +
// mid-market portfolios, renewals/expansion. Senior-IC and people-leader CS
// titles are IN; entry-level, support, SMB/scaled, and VP+/C-level are OUT.
const BRODI: SearchProfile = {
  key: 'brodi',
  label: 'Brodi',
  blurb: 'Enterprise / strategic customer success, IC and leadership',
  feeds: [
    {
      key: 'enterprise_cs',
      label: 'Enterprise CS / AM',
      // Post-sale titles only. "Strategic/Key Account *Executive*" is quota sales
      // and "Account Director" is the agency/enterprise-AE title — neither is in.
      // "technical account" is anchored to "manager" so "Technical Accounting"
      // (finance) can't match.
      pattern:
        /customer success|\bcsm\b|account manager|technical account manager|\btam\b|client partner|client success|relationship manager|(?:key|strategic|named) account (?:manager|director|partner)|(?:director|head) of (?:key|strategic|named) accounts|implementation manager|onboarding manager|partner manager/i,
    },
    {
      // People-leader CS titles. "Customer Success Manager" (the IC title) must
      // NOT match here — leadership is signalled by "Manager, X" / "Manager of
      // X" / "Director|Head of X" / "X Lead|Director".
      key: 'cs_leadership',
      label: 'CS Leadership',
      pattern:
        /manager(?:,| of)\s*(?:customer|client) success|(?:director|head)(?: of|,)?\s*(?:customer|client) success|head of[^,|–-]*(?:customer|client) success|(?:customer|client) success (?:director|team lead|lead)\b|(?:director|head|manager)(?: of|,)\s*account management|customer success leader/i,
    },
  ],
  // Entry-level, support, SMB/scaled, VP+/C-level; CS *operations/systems*
  // roles (internal tooling, not customer-facing); agency / ad-account roles.
  exclude:
    /junior|\bjr\.?\b|associate|intern(?:ship)?\b|entry[-\s]level|new grad|graduate|coordinator|\bspecialist\b|representative|\bsdr\b|\bbdr\b|\bsupport\b|\bsmb\b|scaled|\bvp\b|vice president|\bsvp\b|\bevp\b|chief|\bcco\b|(?:customer|client) success (?:operations|ops|systems)|\bcs ops\b|operations manager|enablement|analyst|public relations|advertising|\bads\b|agency|media\b/i,
  minYears: 3,
  maxYears: 15,
}

export const SEARCH_PROFILES: Record<ProfileKey, SearchProfile> = { erin: ERIN, brodi: BRODI }
export const PROFILE_KEYS = Object.keys(SEARCH_PROFILES) as ProfileKey[]
export const DEFAULT_PROFILE: ProfileKey = 'erin'

export function isProfileKey(v: unknown): v is ProfileKey {
  return typeof v === 'string' && v in SEARCH_PROFILES
}

/** Resolve a profile key; unknown → the default (Erin). */
export function getSearchProfile(key: unknown): SearchProfile {
  return SEARCH_PROFILES[isProfileKey(key) ? key : DEFAULT_PROFILE]
}

/**
 * Role categories a title belongs to, for one profile.
 *  - Software/tech engineering → ['engineering'] when enabled, else [].
 *  - Any other "…engineer" title (electronics, mechanical, sales engineer,
 *    customer-success engineer) → [] (not a target role — keeps them out of AM
 *    and out of the engineering feed).
 *  - Otherwise, the profile's feeds that match.
 */
export function categorize(title: string, profile: SearchProfile): RoleCategory[] {
  if (SOFTWARE_PATTERN.test(title)) {
    return ENGINEERING_ENABLED && profile.feeds.some((f) => f.key === 'engineering')
      ? [ENGINEERING_FEED.key]
      : []
  }
  if (NON_SOFTWARE_ENGINEER.test(title)) return []
  return profile.feeds
    .filter((f) => f.key !== 'engineering' && f.pattern.test(title))
    .map((f) => f.key)
}

/** Does a title match any of the profile's feeds and pass its title gate. */
export function matchesTitle(title: string, profile: SearchProfile): boolean {
  return categorize(title, profile).length > 0 && !profile.exclude.test(title)
}

// Clear non-North-America geo indicators. When one of these appears in a title
// or location, the role is region-locked outside NA (US/Canada) and is excluded
// — e.g. "Account Executive, LATAM", "Account Executive, Named - Germany",
// "Remote (EU)". NA terms (US, USA, Canada, North America, Americas, AMER) are
// deliberately absent so they stay included.
export const NON_NA_GEO =
  /\b(latam|latin america|emea|apac|\bapj\b|anz|dach|mena|benelux|nordics?|iberia|europe|european|\beu\b|\buk\b|united kingdom|great britain|britain|ireland|germany|france|spain|italy|portugal|netherlands|belgium|luxembourg|switzerland|austria|poland|czech|romania|hungary|greece|sweden|denmark|norway|finland|iceland|turkey|ukraine|russia|middle east|israel|\buae\b|dubai|saudi|qatar|africa|nigeria|kenya|egypt|morocco|asia|\bapac\b|india|china|hong kong|taiwan|japan|korea|singapore|malaysia|indonesia|thailand|vietnam|philippines|pakistan|bangladesh|australia|new zealand|oceania|brazil|argentina|colombia|chile|peru|mexico|tel aviv|london|berlin|munich|paris|amsterdam|dublin|madrid|barcelona|lisbon|milan|zurich|stockholm|warsaw|bangalore|bengaluru|mumbai|delhi|hyderabad|sydney|melbourne|tokyo|seoul|s[aã]o paulo)\b/i

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

// Years-of-experience the description asks for. Each profile sets its own
// window: too many years → 'seniority', too few → 'junior'.
const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi

/** Max years-of-experience the description asks for (0 if none / not experience-related). */
export function maxExperienceYears(text: string | null | undefined): number {
  if (!text) return 0
  let max = 0
  for (const m of text.matchAll(YEARS_RE)) {
    const idx = m.index ?? 0
    const window = text.slice(Math.max(0, idx - 30), idx + 45).toLowerCase()
    // Only count numbers clearly about required experience (reduce false positives).
    if (/experience|exp\b|background|track record|selling|sales|account|success|professional|industry|relevant|minimum|at least|customer|client|role\b/.test(window)) {
      const n = Number(m[1])
      if (n > max && n <= 40) max = n
    }
  }
  return max
}

export type FilterInput = { title: string; location?: string | null; description?: string | null }

// Why a matching-role job was excluded — surfaced in Settings › Filtered so the
// user can review and override false negatives.
export type FilterReason = 'seniority' | 'junior' | 'geo' | 'onsite'

export type FilterResult =
  // Not a target role in any of the profile's feeds — not worth storing.
  | { included: false; relevant: false }
  // A target role excluded by a cross-cutting gate (kept for the review list).
  | { included: false; relevant: true; reason: FilterReason; categories: RoleCategory[] }
  | { included: true; remoteType: RemoteType; verify: boolean; categories: RoleCategory[] }

/**
 * Staged filter for one profile. First categorize the role; a non-matching
 * title is irrelevant. Then apply the gates (title seniority, experience
 * window, geo, location). The matched categories ride along for feed tagging.
 */
export function filterJob(
  { title, location, description }: FilterInput,
  profile: SearchProfile,
): FilterResult {
  const categories = categorize(title, profile)
  if (categories.length === 0) return { included: false, relevant: false }
  if (profile.exclude.test(title))
    return { included: false, relevant: true, reason: 'seniority', categories }
  const years = maxExperienceYears(description)
  if (years >= profile.maxYears)
    return { included: false, relevant: true, reason: 'seniority', categories }
  if (profile.minYears > 0 && years > 0 && years < profile.minYears)
    return { included: false, relevant: true, reason: 'junior', categories }
  if (isNonNorthAmerica(title, location))
    return { included: false, relevant: true, reason: 'geo', categories }
  const loc = classifyLocation(location)
  if (!loc.keep) return { included: false, relevant: true, reason: 'onsite', categories }
  return { included: true, remoteType: loc.remoteType, verify: loc.verify, categories }
}
