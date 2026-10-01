import { cookies } from 'next/headers'
import { DEFAULT_PROFILE, isProfileKey, type ProfileKey } from './filters'

// Which person's view the browser is on. A plain cookie (no signing needed —
// it only selects between two profiles on a shared, trusted deployment).
export const PROFILE_COOKIE = 'jobby_profile'
export const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // a year
// Query param for deep links: /?person=brodi (handled in proxy.ts → cookie).
export const PROFILE_PARAM = 'person'

/** The active profile for this request; unknown / missing cookie → default (Erin). */
export async function getCurrentProfile(): Promise<ProfileKey> {
  const v = (await cookies()).get(PROFILE_COOKIE)?.value
  return isProfileKey(v) ? v : DEFAULT_PROFILE
}
