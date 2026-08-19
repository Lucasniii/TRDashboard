import type { ReactElement } from 'react'

import { cn } from '@/lib/cn'
import type { ProviderId } from '@/lib/domain/types'
import { getProviderLabel } from '@/lib/providers/registry'

/**
 * The OAuth handshake ends in a redirect, so its outcome arrives as a query
 * parameter. Each case gets one plain German sentence and, where the user can
 * do something about it, what that is.
 */

const ERROR_MESSAGES: Record<string, string> = {
  'nicht-konfiguriert':
    'Für diese Quelle fehlen die Zugangsdaten. Trage Client-ID und Secret in .env.local ein und starte den Server neu.',
  abgebrochen: 'Die Anmeldung wurde abgebrochen. Es wurde nichts verbunden.',
  sicherheitspruefung:
    'Die Sicherheitsprüfung ist fehlgeschlagen — der Rückweg passte nicht zur gestarteten Anmeldung. Bitte versuche es noch einmal.',
  zugangsdaten:
    'Die Anmeldung beim Anbieter hat geklappt, aber er hat Client-ID oder Secret abgelehnt. Prüfe, ob beide Werte zu derselben App im Entwicklerportal gehören — eine ID aus einer anderen App ist die häufigste Ursache.',
  verbindung:
    'Der Austausch des Codes gegen ein Token ist fehlgeschlagen. Der Grund steht in der Server-Ausgabe.',
}

function providerName(value: string | undefined): string | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getProviderLabel(value satisfies ProviderId)
}

export interface ConnectionBannerProps {
  connected?: string | undefined
  error?: string | undefined
  source?: string | undefined
}

export function ConnectionBanner({
  connected,
  error,
  source,
}: ConnectionBannerProps): ReactElement | null {
  const connectedLabel = providerName(connected)
  if (connectedLabel !== null) {
    return (
      <p
        role="status"
        className={cn(
          'rounded-lg border border-border-hair bg-surface px-4 py-3 text-sm text-ink',
          'border-l-2 border-l-good',
        )}
      >
        {connectedLabel} ist verbunden. Mit „Jetzt synchronisieren“ holst du die Daten der letzten
        120 Tage.
      </p>
    )
  }

  if (error === undefined) return null
  const message = ERROR_MESSAGES[error] ?? 'Beim Verbinden ist ein Fehler aufgetreten.'
  const label = providerName(source)

  return (
    <p
      role="alert"
      className={cn(
        'rounded-lg border border-border-hair bg-surface px-4 py-3 text-sm text-ink',
        'border-l-2 border-l-critical',
      )}
    >
      {label === null ? message : `${label}: ${message}`}
    </p>
  )
}
