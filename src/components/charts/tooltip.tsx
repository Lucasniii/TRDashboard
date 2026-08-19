'use client'

import type { ReactNode } from 'react'
import type { TooltipContentProps } from 'recharts'

import { numericValue, textValue } from '@/components/charts/chart-frame'
import { NO_DATA, formatNumber } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * One tooltip for every chart in the app. It reads the hovered row itself
 * instead of trusting Recharts' payload order, so a series whose value is null
 * on that day still gets a line — reading "keine Daten" rather than vanishing.
 */

// ── cursors ──────────────────────────────────────────────────────────────────

/** Vertical crosshair for line and area charts. */
export const TOOLTIP_CURSOR = {
  stroke: 'var(--axis)',
  strokeWidth: 1,
  strokeDasharray: '4 4',
} as const

/** Bars get a quiet band behind the hovered category instead of a line. */
export const BAR_TOOLTIP_CURSOR = {
  fill: 'var(--surface-2)',
} as const

// ── presentation ─────────────────────────────────────────────────────────────

export interface ChartTooltipRow {
  key: string
  /** German series name. */
  label: string
  /** Marker colour; omit for a row without a swatch. */
  color?: string
  /** Already formatted for de-AT, or null for a missing measurement. */
  value: string | null
}

export interface ChartTooltipProps {
  /** Date or category heading, already formatted. */
  title?: string
  rows: readonly ChartTooltipRow[]
  /** Quiet line under the rows, e.g. "berechnet". */
  footnote?: string
  className?: string
}

export function ChartTooltip({ title, rows, footnote, className }: ChartTooltipProps) {
  if (rows.length === 0) return null
  return (
    <div
      className={cn(
        'pointer-events-none rounded-lg border border-border-hair bg-surface px-3 py-2 shadow-sm',
        className,
      )}
    >
      {title === undefined || title === '' ? null : (
        <p className="mb-1.5 text-xs font-medium text-ink-secondary">{title}</p>
      )}
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-xs">
            {row.color === undefined ? null : (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-ink-secondary">{row.label}</span>
            {row.value === null ? (
              <span className="ml-auto pl-4 text-ink-muted">{NO_DATA}</span>
            ) : (
              <span className="tabular ml-auto pl-4 font-medium text-ink">{row.value}</span>
            )}
          </li>
        ))}
      </ul>
      {footnote === undefined ? null : <p className="mt-1.5 text-[11px] text-ink-muted">{footnote}</p>}
    </div>
  )
}

// ── Recharts adapter ─────────────────────────────────────────────────────────

export interface TooltipSeriesSpec<T> {
  dataKey: Extract<keyof T, string>
  /** German series name. */
  label: string
  color?: string
  /** de-AT formatter for this series' unit. */
  format?: (value: number) => string
}

export interface ChartTooltipFactoryOptions<T> {
  series: ReadonlyArray<TooltipSeriesSpec<T>>
  /** Turns the x value into the German heading, e.g. "Mo, 14. Aug.". */
  formatLabel?: (value: string) => string
  /** Fallback formatter for series without their own. */
  formatValue?: (value: number) => string
  footnote?: string
}

export type ChartTooltipRenderer = (props: TooltipContentProps) => ReactNode

/**
 * Builds the `content` callback for a Recharts `<Tooltip>`. Values are pulled
 * from the hovered source row by key, never invented and never interpolated.
 */
export function createChartTooltip<T extends object>(
  options: ChartTooltipFactoryOptions<T>,
): ChartTooltipRenderer {
  const { series, formatLabel, formatValue, footnote } = options

  return function ChartTooltipContent(props: TooltipContentProps): ReactNode {
    if (!props.active) return null

    const entries = props.payload ?? []
    const first = entries[0]
    const row: unknown = first === undefined ? undefined : first.payload

    const rawLabel = textValue(props.label)
    const title = rawLabel === '' ? undefined : (formatLabel?.(rawLabel) ?? rawLabel)

    const rows: ChartTooltipRow[] = series.map((spec) => {
      const fromRow = numericValue(row, spec.dataKey)
      const fromPayload =
        fromRow === null
          ? (() => {
              const match = entries.find((entry) => entry.dataKey === spec.dataKey)
              const value = match?.value
              return typeof value === 'number' && Number.isFinite(value) ? value : null
            })()
          : fromRow
      const format = spec.format ?? formatValue ?? ((value: number) => formatNumber(value))
      return {
        key: spec.dataKey,
        label: spec.label,
        ...(spec.color === undefined ? {} : { color: spec.color }),
        value: fromPayload === null ? null : format(fromPayload),
      }
    })

    return (
      <ChartTooltip
        {...(title === undefined ? {} : { title })}
        rows={rows}
        {...(footnote === undefined ? {} : { footnote })}
      />
    )
  }
}
