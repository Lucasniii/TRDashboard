'use client'

import type { ReactElement } from 'react'

import { TrendLineChart } from '@/components/charts/line-chart'
import {
  metricFormatter,
  type MetricUnit,
  type TrendRow,
} from '@/components/health/health-metrics'
import { fromDayKey } from '@/lib/date'
import { formatDayMonth, formatNumber, formatWeekdayShort } from '@/lib/format'

/**
 * Daily measurements, their 7-day mean and the personal baseline band. Lives on
 * the client only because Recharts needs the de-AT formatters as functions —
 * every number it draws was computed on the server.
 */

/** Half-width of the baseline band, matching the dead band of the trend logic. */
const BASELINE_BAND_PCT = 3

export interface MetricTrendChartProps {
  rows: readonly TrendRow[]
  /** German series name, e.g. "HRV". */
  seriesLabel: string
  unit: MetricUnit
  baseline: number | null
  /** Head- and foot-room around the data, in the metric's own unit. */
  yPadding: number
  height?: number
  /** Accessible name for the plot. */
  chartLabel: string
  emptyDescription: string
}

export function MetricTrendChart({
  rows,
  seriesLabel,
  unit,
  baseline,
  yPadding,
  height = 260,
  chartLabel,
  emptyDescription,
}: MetricTrendChartProps): ReactElement {
  const format = metricFormatter(unit)
  const hasBaseline = baseline !== null && Number.isFinite(baseline)

  return (
    <TrendLineChart
      data={rows}
      xKey="date"
      series={[
        { dataKey: 'value', label: seriesLabel, format },
        { dataKey: 'avg7', label: 'Ø 7 Tage', dashed: true, format },
      ]}
      height={height}
      formatX={(value) => formatDayMonth(fromDayKey(value))}
      formatTooltipLabel={(value) =>
        `${formatWeekdayShort(fromDayKey(value))}, ${formatDayMonth(fromDayKey(value))}`
      }
      formatY={(value) => formatNumber(Math.round(value))}
      yDomain={[`dataMin - ${String(yPadding)}`, `dataMax + ${String(yPadding)}`]}
      {...(hasBaseline
        ? {
            baseline: {
              value: baseline,
              band: Math.abs(baseline) * (BASELINE_BAND_PCT / 100),
              label: 'Baseline',
            },
          }
        : {})}
      label={chartLabel}
      emptyDescription={emptyDescription}
    />
  )
}
