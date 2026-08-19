'use client'

import { useState, useTransition, type ReactElement } from 'react'

import { disconnectAction, runSyncAction, type SyncResultRow } from '@/app/einstellungen/actions'
import { cn } from '@/lib/cn'
import type { ProviderId } from '@/lib/domain/types'

/**
 * The controls of one row in "Datenquellen". Connecting is a plain link — the
 * OAuth handshake is a redirect, not a fetch. Syncing and disconnecting go
 * through server actions, so the tokens never reach the browser.
 */

const BUTTON = cn(
  'shrink-0 rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink',
  'transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1',
)

const QUIET_BUTTON = cn(
  'shrink-0 rounded-lg border border-border-hair px-3 py-1.5 text-sm text-ink-secondary',
  'transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1',
)

function countsSentence(row: SyncResultRow): string {
  const { activities, dailyHealth, sleep, recovery } = row.counts
  const parts = [
    `${String(activities)} Aktivitäten`,
    `${String(dailyHealth)} Tageswerte`,
    `${String(sleep)} Nächte`,
    `${String(recovery)} Erholungswerte`,
  ]
  return parts.join(', ')
}

export interface DataSourceActionsProps {
  provider: ProviderId
  label: string
  connected: boolean
  configured: boolean
  /** Set for platforms that already have an adapter; others cannot be connected yet. */
  connectable: boolean
  /** The two variables the user has to fill in .env.local, named in the hint. */
  envVars?: readonly [string, string]
}

export function DataSourceActions({
  provider,
  label,
  connected,
  configured,
  connectable,
  envVars,
}: DataSourceActionsProps): ReactElement {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)

  function report(text: string, isError: boolean): void {
    setMessage(text)
    setFailed(isError)
  }

  function sync(): void {
    setMessage(null)
    startTransition(async () => {
      const result = await runSyncAction(provider)
      if (!result.ok) {
        report(result.message, true)
        return
      }
      const row = result.rows[0]
      if (row === undefined) {
        report('Der Abgleich hat nichts zurückgegeben.', true)
        return
      }
      if (row.status === 'succeeded') report(countsSentence(row), false)
      else report(row.error ?? 'Der Abgleich ist fehlgeschlagen.', true)
    })
  }

  function disconnect(): void {
    setMessage(null)
    setConfirmingDisconnect(false)
    startTransition(async () => {
      const result = await disconnectAction(provider)
      report(result.message, !result.ok)
    })
  }

  if (!connectable) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" disabled className={QUIET_BUTTON}>
          Verbinden
        </button>
        <p className="text-xs text-ink-muted">Anbindung folgt</p>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="flex min-w-0 shrink-0 flex-col items-end gap-1">
        <button type="button" disabled className={QUIET_BUTTON}>
          Verbinden
        </button>
        {envVars === undefined ? null : (
          <p className="max-w-[16rem] text-right text-xs text-ink-muted">
            Zugangsdaten fehlen: <code className="text-ink-secondary">{envVars[0]}</code> und{' '}
            <code className="text-ink-secondary">{envVars[1]}</code> in <code>.env.local</code>{' '}
            eintragen und den Server neu starten.
          </p>
        )}
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        {/* A full page navigation on purpose: the provider answers with a redirect. */}
        <a href={`/api/auth/${provider}`} className={BUTTON}>
          Verbinden
        </a>
        <p className="text-xs text-ink-muted">Führt zur Anmeldung bei {label}</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 shrink-0 flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={sync} disabled={pending} className={BUTTON}>
          {pending ? 'Wird synchronisiert …' : 'Jetzt synchronisieren'}
        </button>
        {confirmingDisconnect ? null : (
          <button
            type="button"
            onClick={() => setConfirmingDisconnect(true)}
            disabled={pending}
            className={QUIET_BUTTON}
          >
            Trennen
          </button>
        )}
      </div>

      {confirmingDisconnect ? (
        <div className="flex max-w-[20rem] flex-col items-end gap-2 rounded-lg border border-border-hair bg-surface-2 p-3">
          <p className="text-right text-xs text-ink-secondary">
            {label} trennen? Der Zugang wird entfernt und alle von dieser Quelle gelieferten
            Datensätze werden gelöscht.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(false)}
              className={QUIET_BUTTON}
            >
              Abbrechen
            </button>
            <button type="button" onClick={disconnect} className={BUTTON}>
              Trennen
            </button>
          </div>
        </div>
      ) : null}

      {message === null ? null : (
        <p
          role="status"
          className={cn(
            'max-w-[20rem] text-right text-xs',
            failed ? 'text-critical' : 'text-ink-secondary',
          )}
        >
          {message}
        </p>
      )}
    </div>
  )
}
