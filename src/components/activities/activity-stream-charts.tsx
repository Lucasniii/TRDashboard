'use client'

import type { ReactElement } from 'react'

import { SERIES_COLORS } from '@/components/charts/chart-frame'
import { SyncedPanels, type SyncedPanel } from '@/components/charts/synced-panels'
import type { StreamKey, StreamPoint } from '@/components/activities/streams'
import {
  formatDurationClock,
  formatElevation,
  formatHeartRate,
  formatNumber,
  formatPower,
} from '@/lib/format'

/**
 * The recorded traces of one activity, stacked on a single x-axis: hovering one
 * panel marks the same moment in every other. Each panel keeps its own y-scale
 * — watts and heart rate share a ride, not a unit.
 *
 * The formatter functions live on this side of the client boundary; the server
 * page only passes rows and the list of panels that actually have data.
 */

interface PanelSpec {
  title: string
  /** German unit shown beside the panel title. */
  unit: string
  dataKey: Extract<keyof StreamPoint, string>
  /** Tooltip readout, with unit. */
  format: (value: number) => string
  /** Axis ticks, bare — the unit is already in the title. */
  formatY: (value: number) => string
  /** Traces that never touch zero get a fitted domain instead of a squashed one. */
  yDomain?: [number | string, number | string]
}

const PANEL_SPECS: Record<StreamKey, PanelSpec> = {
  power: {
    title: 'Leistung',
    unit: 'W',
    dataKey: 'power',
    format: (value) => formatPower(value),
    formatY: (value) => formatNumber(value),
  },
  heartRate: {
    title: 'Herzfrequenz',
    unit: 'bpm',
    dataKey: 'heartRate',
    format: (value) => formatHeartRate(value),
    formatY: (value) => formatNumber(value),
    yDomain: ['dataMin - 5', 'dataMax + 5'],
  },
  speed: {
    title: 'Geschwindigkeit',
    unit: 'km/h',
    dataKey: 'speedKmh',
    format: (value) => `${formatNumber(value, 1)} km/h`,
    formatY: (value) => formatNumber(value),
  },
  altitude: {
    title: 'Höhe',
    unit: 'm',
    dataKey: 'altitudeM',
    format: (value) => formatElevation(value),
    formatY: (value) => formatNumber(value),
    yDomain: ['dataMin - 10', 'dataMax + 10'],
  },
  cadence: {
    title: 'Kadenz',
    unit: 'rpm',
    dataKey: 'cadence',
    format: (value) => `${formatNumber(value)} rpm`,
    formatY: (value) => formatNumber(value),
  },
}

/** Activity time, e.g. "1:24" for one hour twenty-four into the ride. */
function formatActivityTime(value: string): string {
  const seconds = Number(value)
  return Number.isFinite(seconds) ? formatDurationClock(seconds) : ''
}

export interface ActivityStreamChartsProps {
  points: StreamPoint[]
  /** Panels with data, in display order. */
  keys: readonly StreamKey[]
}

export function ActivityStreamCharts({ points, keys }: ActivityStreamChartsProps): ReactElement {
  const panels: Array<SyncedPanel<StreamPoint>> = keys.map((key) => {
    const spec = PANEL_SPECS[key]
    return {
      key,
      title: spec.title,
      unit: spec.unit,
      series: [
        {
          dataKey: spec.dataKey,
          label: spec.title,
          color: SERIES_COLORS[0],
          format: spec.format,
        },
      ],
      formatY: spec.formatY,
      formatValue: spec.format,
      ...(spec.yDomain === undefined ? {} : { yDomain: spec.yDomain }),
    }
  })

  return (
    <SyncedPanels<StreamPoint>
      data={points}
      xKey="timeSec"
      panels={panels}
      formatX={formatActivityTime}
      formatTooltipLabel={(value) => `${formatActivityTime(value)} h`}
    />
  )
}
