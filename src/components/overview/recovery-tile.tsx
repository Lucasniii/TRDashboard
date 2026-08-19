import type { ReactElement } from 'react'

import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import type { Readiness } from '@/lib/analytics/health'
import { formatNumber } from '@/lib/format'

/**
 * "Erholung". A provider score always wins — it is a measurement we received.
 * Only when no source reports one does our own estimate step in, and then it
 * says so: the "berechnet" badge is part of the number, not a footnote.
 */

export interface RecoveryTileProps {
  /** Score exactly as a provider reported it, or null when none did. */
  providerScore: number | null
  /** Our own estimate — used only in the absence of a provider score. */
  readiness: Readiness | null
}

export function RecoveryTile({ providerScore, readiness }: RecoveryTileProps): ReactElement {
  if (providerScore !== null) {
    return (
      <StatTile
        label="Erholung"
        value={formatNumber(providerScore)}
        footnote="Erholungswert der Datenquelle"
      />
    )
  }

  if (readiness !== null) {
    return (
      <StatTile
        label="Erholung"
        value={formatNumber(readiness.score)}
        footnote="Aus HRV, Ruhepuls, Schlaf und Trainingsbelastung berechnet"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-secondary">{readiness.label}</span>
          <Badge tone="info">berechnet</Badge>
        </span>
      </StatTile>
    )
  }

  return (
    <StatTile label="Erholung" value={null} footnote="Keine Quelle liefert Erholungsdaten" />
  )
}
