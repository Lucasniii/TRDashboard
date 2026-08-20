import { NextResponse } from 'next/server'

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import {
  createSession,
  getCurrentUser,
  linkWahooUser,
  sessionCookie,
  upsertWahooUser,
  upsertWhoopUser,
} from '@/lib/auth/session'
import { consumeState } from '@/lib/store/oauth-state'
import { saveUserConnection } from '@/lib/store/user-tokens'
import { whoopAdapter } from '@/lib/providers/whoop'
import { wahooAdapter } from '@/lib/providers/wahoo'

/**
 * Step two: the provider sends the user back with a code. The code is traded
 * for tokens on the server and stored; the browser only ever sees a redirect.
 *
 * WHOOP and Wahoo can each create a dashboard identity through their normal
 * login. When someone already has an open WHOOP session, Wahoo is linked to
 * that same account instead. Syncing happens afterwards so an OAuth callback
 * always returns before a serverless function times out.
 *
 * Failures are deliberately coarse — `abgebrochen`, `sicherheitspruefung`,
 * `verbindung`. The detail of a token error can quote the request body, so it
 * is neither put in the URL nor logged; only the provider id is.
 */

export const dynamic = 'force-dynamic'

function parseProvider(value: string): ProviderId | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getAdapter(value) === null ? null : value
}

function resolveBaseUrl(requestUrl: string): string {
  const configured = process.env.TRDASHBOARD_BASE_URL?.trim() ?? ''
  if (configured !== '') return configured.replace(/\/+$/, '')
  return new URL(requestUrl).origin
}

function urlWith(base: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider: raw } = await context.params
  const provider = parseProvider(raw)
  if (provider === null) {
    return NextResponse.json({ error: 'Unbekannte Datenquelle.' }, { status: 404 })
  }

  const requestUrl = new URL(request.url)
  const base = resolveBaseUrl(request.url)
  // Failures land back on the sign-in screen, which is where a retry belongs.
  const failure = (reason: string): Response =>
    NextResponse.redirect(urlWith(base, '/anmelden', { fehler: reason, quelle: provider }), 302)

  // The user declined on the provider's consent screen, or the provider
  // refused. Either way there is no code to redeem.
  if (requestUrl.searchParams.get('error') !== null) return failure('abgebrochen')

  const state = requestUrl.searchParams.get('state')
  if (!(await consumeState(provider, state))) return failure('sicherheitspruefung')

  const code = requestUrl.searchParams.get('code')
  if (code === null || code === '') return failure('abgebrochen')

  const adapter = getAdapter(provider)
  if (adapter === null) {
    return NextResponse.json({ error: 'Unbekannte Datenquelle.' }, { status: 404 })
  }

  let tokens
  try {
    // The redirect URI has to be byte-identical to the one sent in step one.
    tokens = await adapter.exchangeCode(code, `${base}/api/auth/${provider}/callback`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    const status = /\((\d{3})\)/.exec(detail)?.[1] ?? 'unbekannt'
    console.error(`OAuth-Token-Tausch fehlgeschlagen: ${provider} — HTTP ${status}`)
    return failure('verbindung')
  }

  try {
    if (provider === 'whoop') {
      const identity = await whoopAdapter.getIdentity(tokens)
      const user = await upsertWhoopUser({
        whoopUserId: identity.id,
        displayName: identity.displayName,
        email: identity.email,
      })
      await saveUserConnection(user.id, provider, tokens)
      const sessionToken = await createSession(user.id)
      const response = NextResponse.redirect(urlWith(base, '/', { verbunden: provider }), 302)
      response.cookies.set(sessionCookie(sessionToken))
      return response
    }

    const identity = await wahooAdapter.getIdentity(tokens)
    const current = await getCurrentUser()
    const user =
      current === null
        ? await upsertWahooUser({
            wahooUserId: identity.id,
            displayName: identity.displayName,
            email: identity.email,
          })
        : await linkWahooUser(current.id, {
            wahooUserId: identity.id,
            displayName: identity.displayName,
            email: identity.email,
          })
    await saveUserConnection(user.id, provider, tokens)
    if (current !== null) {
      return NextResponse.redirect(urlWith(base, '/einstellungen', { verbunden: provider }), 302)
    }
    const sessionToken = await createSession(user.id)
    const response = NextResponse.redirect(urlWith(base, '/', { verbunden: provider }), 302)
    response.cookies.set(sessionCookie(sessionToken))
    return response
  } catch {
    // This covers the profile lookup, private token encryption and session
    // creation. None of those details or provider responses reach the browser.
    console.error(`OAuth-Konto konnte nicht eingerichtet werden: ${provider}`)
    return failure('verbindung')
  }
}
