import Link from 'next/link'
import type { ReactElement } from 'react'

import { cn } from '@/lib/cn'
import { getProviderLabel } from '@/lib/providers/registry'

/**
 * Shown once, right after the OAuth callback lands here. The callback already
 * ran the first sync, so this either confirms both steps or names the one that
 * did not work — the sign-in itself held in both cases.
 */

export interface SignInResultProps {
  provider: string
  syncFailed: boolean
}

export function SignInResult({ provider, syncFailed }: SignInResultProps): ReactElement | null {
  if (provider !== 'whoop' && provider !== 'wahoo') return null
  const label = getProviderLabel(provider)

  if (syncFailed) {
    return (
      <p
        role="alert"
        className={cn(
          'rounded-lg border border-border-hair border-l-2 border-l-warning bg-surface px-4 py-3 text-sm text-ink',
        )}
      >
        {label} ist verbunden, aber der erste Abgleich ist fehlgeschlagen. Du kannst ihn in den{' '}
        <Link href="/einstellungen" className="underline underline-offset-2">
          Einstellungen
        </Link>{' '}
        erneut starten.
      </p>
    )
  }

  return (
    <p
      role="status"
      className={cn(
        'rounded-lg border border-border-hair border-l-2 border-l-good bg-surface px-4 py-3 text-sm text-ink',
      )}
    >
      Mit {label} angemeldet. Die Daten der letzten 120 Tage sind übernommen.
    </p>
  )
}
