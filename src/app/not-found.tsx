import Link from 'next/link'
import type { ReactElement } from 'react'

export default function NotFound(): ReactElement {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="tabular text-6xl font-semibold tracking-tight text-ink-muted">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Seite nicht gefunden</h1>
      <p className="mt-2 max-w-md text-sm text-ink-secondary">
        Diese Seite gibt es nicht oder sie wurde verschoben. Über die Navigation erreichst du alle
        Bereiche.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
      >
        Zurück zur Übersicht
      </Link>
    </div>
  )
}
