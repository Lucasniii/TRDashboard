'use client'

import { EmptyState } from '@/components/ui/empty-state'
import { zoneFillClass } from '@/components/charts/chart-frame'
import type { ZoneSlice } from '@/lib/analytics/zones'
import { formatDuration, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * "Zeit in Trainingszonen". Plain HTML on purpose: a stacked bar this simple
 * needs no chart runtime, and the legend below carries the real numbers so the
 * ordinal ramp never has to be decoded by eye.
 */

const SEGMENT_GAP = 2

export interface ZoneDistributionProps {
  slices: readonly ZoneSlice[]
  totalSec: number
  /** Overrides the derived check; otherwise a zero total means empty. */
  hasData?: boolean
  /** The legend list below the bar — the direct-label relief. */
  showLegend?: boolean
  /** Bar thickness. */
  size?: 'sm' | 'md'
  /** Accessible name for the bar, e.g. "Zeit in Trainingszonen". */
  label?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

function barHeight(size: 'sm' | 'md'): string {
  return size === 'sm' ? 'h-2' : 'h-3'
}

/** The bar itself, without the legend — reused by the comparison view. */
function ZoneStack({
  slices,
  size = 'md',
  label,
  className,
}: {
  slices: readonly ZoneSlice[]
  size?: 'sm' | 'md'
  label?: string
  className?: string
}) {
  const visible = slices.filter((slice) => slice.seconds > 0)
  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-surface', barHeight(size), className)}
      style={{ gap: SEGMENT_GAP }}
      {...(label === undefined ? {} : { role: 'img', 'aria-label': label })}
    >
      {visible.map((slice) => (
        <div
          key={slice.zone}
          // The gap between segments shows the surface through — a 2px spacer.
          className={cn('h-full min-w-0', zoneFillClass(slice.zone - 1))}
          style={{ flexGrow: slice.share, flexBasis: 0 }}
        />
      ))}
    </div>
  )
}

export function ZoneDistribution({
  slices,
  totalSec,
  hasData,
  showLegend = true,
  size = 'md',
  label,
  emptyTitle,
  emptyDescription,
  className,
}: ZoneDistributionProps) {
  const filled = hasData ?? totalSec > 0

  if (!filled) {
    return (
      <EmptyState
        {...(emptyTitle === undefined ? {} : { title: emptyTitle })}
        {...(emptyDescription === undefined
          ? { description: 'Keine Zonendaten für diesen Zeitraum' }
          : { description: emptyDescription })}
        {...(className === undefined ? {} : { className })}
      />
    )
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      <ZoneStack slices={slices} size={size} {...(label === undefined ? {} : { label })} />

      {!showLegend ? null : (
        <ul className="flex flex-col gap-2">
          {slices.map((slice) => (
            <li
              key={slice.zone}
              className="grid grid-cols-[0.625rem_minmax(0,1fr)_auto_3.25rem] items-center gap-x-2 text-sm"
            >
              <span
                aria-hidden="true"
                className={cn('h-2.5 w-2.5 rounded-[2px]', zoneFillClass(slice.zone - 1))}
              />
              {/* The zone names are the direct labels that carry identity when the
                  ramp steps sit close together, so they wrap rather than truncate. */}
              <span className="leading-snug text-ink-secondary">{slice.label}</span>
              <span className="tabular text-right text-ink">{formatDuration(slice.seconds)}</span>
              <span className="tabular text-right text-ink-muted">
                {formatPercent(slice.share)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── current vs. previous week ────────────────────────────────────────────────

export interface ZoneComparisonSeries {
  /** German row label, e.g. "Diese Woche". */
  label: string
  slices: readonly ZoneSlice[]
  totalSec: number
}

export interface ZoneComparisonBarsProps {
  current: ZoneComparisonSeries
  previous: ZoneComparisonSeries
  /** Zone names below the two bars — identity never rides on colour alone. */
  showLegend?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

export function ZoneComparisonBars({
  current,
  previous,
  showLegend = true,
  emptyTitle,
  emptyDescription,
  className,
}: ZoneComparisonBarsProps) {
  const rows = [current, previous]
  const filled = rows.some((row) => row.totalSec > 0)

  if (!filled) {
    return (
      <EmptyState
        {...(emptyTitle === undefined ? {} : { title: emptyTitle })}
        {...(emptyDescription === undefined
          ? { description: 'Keine Zonendaten für diesen Zeitraum' }
          : { description: emptyDescription })}
        {...(className === undefined ? {} : { className })}
      />
    )
  }

  // The legend names the zones once for both bars; totals sit beside each bar.
  const legendSlices = current.totalSec > 0 ? current.slices : previous.slices

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-ink-secondary">{row.label}</span>
              <span className="tabular text-ink">{formatDuration(row.totalSec)}</span>
            </div>
            {row.totalSec > 0 ? (
              <ZoneStack slices={row.slices} size="sm" label={row.label} />
            ) : (
              <p className="text-xs text-ink-muted">Keine Zonendaten</p>
            )}
          </div>
        ))}
      </div>

      {!showLegend ? null : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {legendSlices.map((slice) => (
            <li key={slice.zone} className="flex items-center gap-2 text-xs text-ink-secondary">
              <span
                aria-hidden="true"
                className={cn('h-2.5 w-2.5 shrink-0 rounded-[2px]', zoneFillClass(slice.zone - 1))}
              />
              <span>{slice.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
