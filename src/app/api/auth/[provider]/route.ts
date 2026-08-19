import { NextResponse } from 'next/server'

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter, isProviderConfigured } from '@/lib/providers/registry'
import { createState } from '@/lib/store/oauth-state'

/**
 * Step one of the OAuth round trip: mint a state, hand the user to the
 * provider's consent screen. Nothing is stored beyond that state — the tokens
 * only exist after the callback.
 *
 * The redirect URI is derived from the request origin so the flow works on
 * whatever port `next dev` picked; TRDASHBOARD_BASE_URL overrides it for a tunnel or
 * a deployment, because it has to match the URI registered with the provider
 * character for character.
 */

export const dynamic = 'force-dynamic'

/** Only providers with an adapter can run a flow; anything else is a 404. */
function parseProvider(value: string): ProviderId | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getAdapter(value) === null ? null : value
}

function resolveBaseUrl(requestUrl: string): string {
  const configured = process.env.TRDASHBOARD_BASE_URL?.trim() ?? ''
  if (configured !== '') return configured.replace(/\/+$/, '')
  return new URL(requestUrl).origin
}

/** Problems before the redirect belong on the sign-in screen, not in settings. */
function settingsUrl(base: string, params: Record<string, string>): string {
  const url = new URL('/anmelden', base)
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

  const base = resolveBaseUrl(request.url)

  if (!isProviderConfigured(provider)) {
    // No credentials in the environment — nothing to redirect to, so the user
    // goes back to Einstellungen with a reason instead of to a broken screen.
    return NextResponse.redirect(
      settingsUrl(base, { fehler: 'nicht-konfiguriert', quelle: provider }),
      302,
    )
  }

  const adapter = getAdapter(provider)
  if (adapter === null) {
    return NextResponse.json({ error: 'Unbekannte Datenquelle.' }, { status: 404 })
  }

  try {
    const state = await createState(provider)
    const redirectUri = `${base}/api/auth/${provider}/callback`
    return NextResponse.redirect(adapter.getAuthorizationUrl(state, redirectUri), 302)
  } catch {
    // The message could quote the credential check; only the provider id is logged.
    console.error(`OAuth-Start fehlgeschlagen: ${provider}`)
    return NextResponse.redirect(settingsUrl(base, { fehler: 'verbindung', quelle: provider }), 302)
  }
}
