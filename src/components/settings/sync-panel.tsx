'use client'

import { useState, useTransition, type ReactElement } from 'react'

import { runSyncAction, type SyncResultRow } from '@/app/einstellungen/actions'
import { cn } from '@/lib/cn'

/**
 * Runs every connected source in one go. The per-source buttons stay for
 * targeted runs; this is the one the user reaches for after a ride.
 */

function countsSentence(row: SyncResultRow): string {
  const { activities, dailyHealth, sleep, recovery } = row.counts
  return [
    `${String(activities)} Aktivitäten`,
    `${String(dailyHealth)} Tageswerte`,
    `${String(sleep)} Nächte`,
    `${String(recovery)} Erholungswerte`,
  ].join(', ')
}

export function SyncPanel(): ReactElement {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<SyncResultRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function syncAll(): void {
    setRows(null)
    setError(null)
    startTransition(async () => {
      const result = await runSyncAction()
      if (result.ok) setRows(result.rows)
      else setError(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-hair bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary">
          Holt die Daten der letzten 120 Tage von allen verbundenen Quellen.
        </p>
        <button
          type="button"
          onClick={syncAll}
          disabled={pending}
          className={cn(
            'shrink-0 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink',
            'transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1',
          )}
        >
          {pending ? 'Wird synchronisiert …' : 'Alle Quellen synchronisieren'}
        </button>
      </div>

      {error === null ? null : (
        <p role="status" className="text-sm text-critical">
          {error}
        </p>
      )}

      {rows === null ? null : (
        <ul role="status" className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.provider} className="text-sm">
              <span className="font-medium text-ink">{row.label}:</span>{' '}
              {row.status === 'succeeded' ? (
                <span className="text-ink-secondary">{countsSentence(row)}</span>
              ) : (
                <span className={row.status === 'failed' ? 'text-critical' : 'text-ink-muted'}>
                  {row.error ?? 'Kein Ergebnis.'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
