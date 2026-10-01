import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_ENABLED, isValidSession, SESSION_COOKIE } from '@/lib/auth'
import { isProfileKey } from '@/lib/filters'
import { PROFILE_COOKIE, PROFILE_COOKIE_MAX_AGE, PROFILE_PARAM } from '@/lib/profile'

// Auth gate (Next.js 16 renamed `middleware` -> `proxy`). Everything except
// /login and the API routes is behind a valid signed session cookie.
// Defense-in-depth: server actions also re-check the session (see actions.ts).
export function proxy(request: NextRequest) {
  // Deep link to a person: /?person=brodi (any page, any other params kept).
  // Sets the profile cookie and redirects to the same URL without the param,
  // so the shared link is sticky for that browser afterwards.
  const person = request.nextUrl.searchParams.get(PROFILE_PARAM)
  if (person != null) {
    const url = request.nextUrl.clone()
    url.searchParams.delete(PROFILE_PARAM)
    const res = NextResponse.redirect(url)
    if (isProfileKey(person)) {
      res.cookies.set(PROFILE_COOKIE, person, {
        path: '/',
        sameSite: 'lax',
        maxAge: PROFILE_COOKIE_MAX_AGE,
      })
    }
    return res
  }

  if (!AUTH_ENABLED) return NextResponse.next() // login temporarily disabled

  const session = request.cookies.get(SESSION_COOKIE)?.value
  if (isValidSession(session)) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // Run on everything except: API routes (cron is bearer-authed, health is
    // public), Next internals, the favicon, and the login page itself.
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
}
