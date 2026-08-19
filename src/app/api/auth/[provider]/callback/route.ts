import { NextResponse } from 'next/server'

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import { consumeState } from '@/lib/store/oauth-state'
import { saveConnection } from '@/lib/store/tokens'

/**
 * Step two: the provider sends the user back with a code. The code is traded
 * for tokens on the server and stored; the browser only ever sees
 * `/einstellungen?verbunden=<provider>`.
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

function settingsUrl(base: string, params: Record<string, string>): string {
  const url = new URL('/einstellungen', base)
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
  const failure = (reason: string): Response =>
    NextResponse.redirect(settingsUrl(base, { fehler: reason, quelle: provider }), 302)

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

  return NextResponse.redirect(settingsUrl(base, { verbunden: provider }), 302)
}
