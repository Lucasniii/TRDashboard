'use client'

import type { ReactElement } from 'react'

import { TrendLineChart } from '@/components/charts/line-chart'
import type { SeriesPoint } from '@/lib/analytics/health'
import { fromDayKey } from '@/lib/date'
import { formatDayMonth, formatNumber, formatWeekdayShort } from '@/lib/format'

/**
 * The provider's own recovery score, drawn on its own 0–100 scale. One series,
 * so no legend — the card names it and states where the number comes from.
 */

export interface RecoveryChartProps {
  rows: readonly SeriesPoint[]
  /** German series name shown in the tooltip, e.g. "Erholung". */
  seriesLabel: string
  /** Provenance line under the tooltip rows, e.g. "Wert von WHOOP". */
  footnote: string
  height?: number
  chartLabel: string
  emptyDescription: string
}

export function RecoveryChart({
  rows,
  seriesLabel,
  footnote,
  height = 240,
  chartLabel,
  emptyDescription,
}: RecoveryChartProps): ReactElement {
  return (
    <TrendLineChart
      data={rows}
      xKey="date"
      series={[
        {
          dataKey: 'value',
          label: seriesLabel,
          format: (value) => `${formatNumber(value)} / 100`,
        },
      ]}
      height={height}
      formatX={(value) => formatDayMonth(fromDayKey(value))}
      formatTooltipLabel={(value) =>
        `${formatWeekdayShort(fromDayKey(value))}, ${formatDayMonth(fromDayKey(value))}`
      }
      formatY={(value) => formatNumber(value)}
      yDomain={[0, 100]}
      tooltipFootnote={footnote}
      label={chartLabel}
      emptyDescription={emptyDescription}
    />
  )
}
