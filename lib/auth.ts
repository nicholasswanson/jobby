import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'jobscout_session'

/** Constant-time string comparison that never short-circuits on length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    // Compare against self to keep timing uniform, then fail.
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

/** The signed value stored in the session cookie once logged in. */
export function sessionToken(): string {
  return createHmac('sha256', requireEnv('COOKIE_SECRET')).update('authenticated').digest('hex')
}

export function isValidSession(cookieValue: string | undefined | null): boolean {
  if (!cookieValue) return false
  return safeEqual(cookieValue, sessionToken())
}

/** Verify a submitted login password against APP_PASSWORD (constant-time). */
export function verifyPassword(input: string): boolean {
  return safeEqual(input, requireEnv('APP_PASSWORD'))
}

/** Verify the /api/cron bearer token against CRON_SECRET (constant-time). */
export function verifyCronAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !authorizationHeader) return false
  return safeEqual(authorizationHeader, `Bearer ${secret}`)
}
