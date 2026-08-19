import { NextResponse } from 'next/server'

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import { consumeState } from '@/lib/store/oauth-state'
import { saveConnection } from '@/lib/store/tokens'
import { syncProvider } from '@/lib/sync/run-sync'

/**
 * Step two: the provider sends the user back with a code. The code is traded
 * for tokens on the server and stored; the browser only ever sees a redirect.
 *
 * The first sync runs here, before the redirect, so signing in is the only
 * thing the user has to do — they land on a dashboard that already has data.
 * It costs one wait of a few seconds; a sync that fails still counts as a
 * successful connection and says so.
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
  const configured = process.env.STRWO_BASE_URL?.trim() ?? ''
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
  if (!consumeState(provider, state)) return failure('sicherheitspruefung')

  const code = requestUrl.searchParams.get('code')
  if (code === null || code === '') return failure('abgebrochen')

  const adapter = getAdapter(provider)
  if (adapter === null) {
    return NextResponse.json({ error: 'Unbekannte Datenquelle.' }, { status: 404 })
  }

  try {
    // The redirect URI has to be byte-identical to the one sent in step one.
    const tokens = await adapter.exchangeCode(code, `${base}/api/auth/${provider}/callback`)
    saveConnection(provider, tokens)
  } catch {
    console.error(`OAuth-Rückruf fehlgeschlagen: ${provider}`)
    return failure('verbindung')
  }

  // Connected either way from here on: a failed first sync is reported, not
  // treated as a failed sign-in.
  const outcome = await syncProvider(provider)
  const params: Record<string, string> =
    outcome.status === 'succeeded'
      ? { verbunden: provider }
      : { verbunden: provider, abgleich: 'fehlgeschlagen' }

  return NextResponse.redirect(urlWith(base, '/', params), 302)
}
