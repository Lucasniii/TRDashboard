'use client'

import type { ReactElement } from 'react'

import { VolumeBarChart } from '@/components/charts/bar-chart'
import {
  sleepBarLabel,
  type SleepBarRow,
  type SleepGranularity,
} from '@/components/health/health-metrics'
import { fromDayKey } from '@/lib/date'
import { formatDateLong, formatHoursMinutes, formatNumber } from '@/lib/format'

/**
 * Nightly sleep duration. Over long periods the bars carry the mean duration of
 * the nights that were measured in each calendar week — an aggregation the card
 * states in words, never a filled-in night.
 */

const SECONDS_PER_HOUR = 3600

export interface SleepDurationChartProps {
  rows: readonly SleepBarRow[]
  granularity: SleepGranularity
  height?: number
  chartLabel: string
  emptyDescription: string
}

export function SleepDurationChart({
  rows,
  granularity,
  height = 240,
  chartLabel,
  emptyDescription,
}: SleepDurationChartProps): ReactElement {
  const isNightly = granularity === 'nightly'

  return (
    <VolumeBarChart
      data={rows}
      xKey="key"
      valueKey="value"
      emphasisKey="isLatest"
      label={isNightly ? 'Schlafdauer' : 'Ø Schlafdauer pro Nacht'}
      formatValue={(value) => formatHoursMinutes(value)}
      formatY={(value) => formatNumber(value / SECONDS_PER_HOUR, 1)}
      formatX={(value) => sleepBarLabel(granularity, value)}
      formatTooltipLabel={(value) =>
        isNightly
          ? `Nacht auf ${formatDateLong(fromDayKey(value))}`
          : `Woche ab ${formatDateLong(fromDayKey(value))}`
      }
      {...(isNightly ? {} : { tooltipFootnote: 'Mittel der gemessenen Nächte dieser Woche' })}
      height={height}
      chartLabel={chartLabel}
      emptyDescription={emptyDescription}
    />
  )
}
