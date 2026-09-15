import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_ENABLED, isValidSession, SESSION_COOKIE } from '@/lib/auth'

// Auth gate (Next.js 16 renamed `middleware` -> `proxy`). Everything except
// /login and the API routes is behind a valid signed session cookie.
// Defense-in-depth: server actions also re-check the session (see actions.ts).
export function proxy(request: NextRequest) {
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
