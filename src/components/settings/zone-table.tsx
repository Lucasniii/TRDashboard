import type { ReactElement } from 'react'

import { zoneFillClass } from '@/components/charts/chart-frame'
import { EmptyState } from '@/components/ui/empty-state'
import type { TrainingZoneSet, ZoneBoundary } from '@/lib/domain/types'
import { cn } from '@/lib/cn'
import { NO_DATA, formatNumber } from '@/lib/format'

/**
 * One zone set as a table: number, German name, the percentage band it covers
 * and the resulting bounds in the metric's own unit. The colour swatch is the
 * same ordinal ramp the zone bars use, and it never carries meaning on its own
 * — the zone number stands right next to it.
 */

const HEAD_CELL = 'py-2 text-xs font-medium uppercase tracking-wide text-ink-muted'

/** "132–149 bpm", "ab 176 bpm", "bis 137 W" — zone 1 of the power set starts at 0. */
function rangeLabel(boundary: ZoneBoundary, unit: string): string {
  if (boundary.min <= 0) {
    return boundary.max === null ? NO_DATA : `bis ${formatNumber(boundary.max)} ${unit}`
  }
  if (boundary.max === null) return `ab ${formatNumber(boundary.min)} ${unit}`
  return `${formatNumber(boundary.min)}–${formatNumber(boundary.max)} ${unit}`
}

export interface ZoneTableProps {
  zones: TrainingZoneSet
  /** Unit of the bounds: "bpm" or "W". */
  unit: string
  /** Percentage band per zone, index 0 = zone 1. */
  percentLabels: readonly string[]
  /** Header of the percentage column, e.g. "% vom Maximalpuls". */
  percentHeader: string
  /** Table caption for screen readers. */
  caption: string
}

export function ZoneTable({
  zones,
  unit,
  percentLabels,
  percentHeader,
  caption,
}: ZoneTableProps): ReactElement {
  if (zones.boundaries.length === 0) {
    return (
      <EmptyState
        title="Keine Zonen hinterlegt"
        description="Ohne Basiswert lassen sich keine Zonengrenzen berechnen."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[24rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-hair">
            <th scope="col" className={cn(HEAD_CELL, 'pr-3 text-left')}>
              Zone
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'px-3 text-left')}>
              Name
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
              {percentHeader}
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'pl-3 text-right')}>
              Bereich
            </th>
          </tr>
        </thead>

        <tbody>
          {zones.boundaries.map((boundary, index) => (
            <tr key={boundary.zone} className="border-b border-border-hair last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={cn('h-2.5 w-2.5 rounded-[2px]', zoneFillClass(boundary.zone - 1))}
                  />
                  <span className="tabular text-ink">Z{formatNumber(boundary.zone)}</span>
                </span>
              </th>
              <td className="px-3 py-2 text-ink-secondary">{boundary.label}</td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink-muted">
                {percentLabels[index] ?? NO_DATA}
              </td>
              <td className="tabular pl-3 py-2 text-right whitespace-nowrap text-ink">
                {rangeLabel(boundary, unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
