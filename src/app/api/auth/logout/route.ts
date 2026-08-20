import { NextResponse } from 'next/server'

import { clearCurrentSession, expiredSessionCookie } from '@/lib/auth/session'

/** Ends only the dashboard session; revoking a provider grant remains explicit in Einstellungen. */
export async function POST(request: Request): Promise<Response> {
  try {
    await clearCurrentSession()
  } catch {
    // The browser cookie still has to be removed even if a stale session row
    // was already deleted server-side.
  }

  const response = NextResponse.redirect(new URL('/anmelden', request.url), 303)
  response.cookies.set(expiredSessionCookie())
  return response
}
