import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactElement } from 'react'

import { ConnectionBanner } from '@/components/settings/connection-banner'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/section'
import { getCurrentUser } from '@/lib/auth/session'
import { cn } from '@/lib/cn'
import { IS_MOCK_DATA } from '@/lib/data'
import type { ProviderId } from '@/lib/domain/types'
import { isProviderConfigured } from '@/lib/providers/registry'
import { isUserConnected } from '@/lib/store/user-tokens'

/**
 * The sign-in screen. There is no TRDashboard account: signing in means authorising
 * WHOOP is the dashboard identity. Wahoo can be linked afterwards from the
 * settings page to that same dashboard account.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Anmelden · TRDashboard',
  description: 'Mit WHOOP oder Wahoo anmelden',
}

interface ProviderOption {
  provider: ProviderId
  label: string
  /** What this source contributes once connected. */
  delivers: string
  envVars: readonly [string, string]
}

const OPTIONS: readonly ProviderOption[] = [
  {
    provider: 'whoop',
    label: 'WHOOP',
    delivers: 'HRV, Ruhepuls, Schlaf, Erholung und Herzfrequenzzonen',
    envVars: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'],
  },
  {
    provider: 'wahoo',
    label: 'Wahoo',
    delivers: 'Fahrten mit Distanz, Höhenmetern und Leistung',
    envVars: ['WAHOO_CLIENT_ID', 'WAHOO_CLIENT_SECRET'],
  },
]

const PRIMARY = cn(
  'inline-flex items-center justify-center rounded-lg border border-border-strong bg-surface-2',
  'px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1',
)

interface SignInSearchParams {
  fehler?: string
  quelle?: string
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInSearchParams>
}): Promise<ReactElement> {
  const params = await searchParams
  const user = IS_MOCK_DATA ? null : await getCurrentUser()

  const rows = await Promise.all(
    OPTIONS.map(async (option) => ({
      ...option,
      configured: isProviderConfigured(option.provider),
      connected: user === null ? false : await isUserConnected(user.id, option.provider),
      canAuthorize: option.provider === 'whoop' || user !== null,
    })),
  )

  const anyConnected = rows.some((row) => row.connected)
  const anyConfigured = rows.some((row) => row.configured)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Anmelden"
        subline="Melde dich mit WHOOP oder Wahoo an — ein eigenes TRDashboard-Konto gibt es nicht."
        {...(IS_MOCK_DATA ? { action: <Badge tone="warning">Demodaten</Badge> } : {})}
      />

      <ConnectionBanner
        {...(params.fehler === undefined ? {} : { error: params.fehler })}
        {...(params.quelle === undefined ? {} : { source: params.quelle })}
      />

      {IS_MOCK_DATA ? (
        <Card>
          <div className="flex flex-col gap-2 p-1">
            <p className="text-sm text-ink">
              Das Dashboard läuft gerade auf <strong>Demodaten</strong>. Eine Anmeldung ändert
              daran nichts.
            </p>
            <p className="text-sm text-ink-secondary">
              Setze <code>TRDASHBOARD_DATA_SOURCE=local</code> in <code>.env.local</code> und starte den
              Server neu, damit deine echten Daten angezeigt werden.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.provider}
              className="flex flex-col gap-3 border-b border-border-hair py-5 first:pt-1 last:border-0 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-ink">{row.label}</span>
                  {row.connected ? <Badge tone="good">Verbunden</Badge> : null}
                </div>
                <p className="text-sm text-ink-secondary">Liefert {row.delivers}.</p>
                {row.configured || row.connected ? null : (
                  <p className="text-xs text-ink-muted">
                    Zugangsdaten fehlen: <code>{row.envVars[0]}</code> und{' '}
                    <code>{row.envVars[1]}</code> in <code>.env.local</code> eintragen und den
                    Server neu starten.
                  </p>
                )}
              </div>

              {row.connected ? (
                <span className="shrink-0 text-sm text-ink-muted">Bereits angemeldet</span>
              ) : row.configured && row.canAuthorize ? (
                /* A full navigation on purpose — the provider answers with a redirect. */
                <a href={`/api/auth/${row.provider}`} className={cn(PRIMARY, 'shrink-0')}>
                  Mit {row.label} anmelden
                </a>
              ) : (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled
                    className={cn(PRIMARY, 'cursor-not-allowed opacity-50')}
                  >
                    Mit {row.label} anmelden
                  </button>
                  {row.provider === 'wahoo' && user === null ? (
                    <p className="text-xs text-ink-muted">Zuerst mit WHOOP anmelden</p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {anyConfigured ? (
        <p className="text-sm text-ink-muted">
          Nach der Freigabe kannst du in den Einstellungen deinen ersten Abgleich starten. Dabei
          bleiben die Daten jedes WHOOP-Kontos strikt getrennt.
        </p>
      ) : null}

      {anyConnected ? (
        <Link href="/" className={cn(PRIMARY, 'w-fit')}>
          Zur Übersicht
        </Link>
      ) : null}
    </div>
  )
}
