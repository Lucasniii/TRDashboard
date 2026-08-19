import { VOLUME_METRIC_LABELS } from '@/lib/analytics/trends'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatHoursMinutes,
  formatHrv,
  formatKm,
  formatNumber,
  formatPower,
  formatWeight,
} from '@/lib/format'

/**
 * The catalogue of everything the Trends page can plot. One entry per metric,
 * carrying its German name, its unit and its de-AT formatters, so a panel never
 * has to guess how its numbers read.
 *
 * `kind` is the important distinction and it decides how an absent day is read:
 * a `volume` metric is a sum over the day, so a day without an activity is a
 * real 0; a `measurement` is a reading, so a day without one stays null and
 * leaves a gap in the line.
 */

export type TrendMetricId =
  | 'duration'
  | 'distance'
  | 'elevation'
  | 'load'
  | 'avgPower'
  | 'hrv'
  | 'restingHr'
  | 'sleep'
  | 'recovery'
  | 'weight'

export type TrendMetricGroupId = 'training' | 'health'

export type TrendMetricKind = 'volume' | 'measurement'

export interface TrendMetricDefinition {
  id: TrendMetricId
  group: TrendMetricGroupId
  kind: TrendMetricKind
  /** German metric name — panel title, legend entry and picker label. */
  label: string
  /** German unit shown beside the panel title; null when the value is unitless. */
  unit: string | null
  /** Quiet note under the panel title, e.g. where the number comes from. */
  hint?: string
  /** Axis ticks: bare numbers, because the unit already sits in the header. */
  formatAxis: (value: number) => string
  /** Tooltip readout: the full value including its unit. */
  formatValue: (value: number) => string
  yDomain: [number | string, number | string]
  /** German sentence for the panel's empty state. */
  emptyDescription: string
}

/** Magnitudes are read against zero. */
const FROM_ZERO: [number | string, number | string] = [0, 'auto']
/** Levels such as HRV or weight are read as deviations, so the axis follows the data. */
const AROUND_DATA: [number | string, number | string] = ['auto', 'auto']
/** Provider scores live on a fixed 0..100 scale and the axis must show that. */
const SCORE_SCALE: [number | string, number | string] = [0, 100]

function hours(seconds: number): string {
  return formatNumber(seconds / 3600, 1)
}

const NO_ACTIVITIES = 'In diesem Zeitraum wurde keine Aktivität aufgezeichnet.'

export const TREND_METRICS: Readonly<Record<TrendMetricId, TrendMetricDefinition>> = {
  duration: {
    id: 'duration',
    group: 'training',
    kind: 'volume',
    label: VOLUME_METRIC_LABELS.duration,
    unit: 'h',
    formatAxis: hours,
    formatValue: formatDuration,
    yDomain: FROM_ZERO,
    emptyDescription: NO_ACTIVITIES,
  },
  distance: {
    id: 'distance',
    group: 'training',
    kind: 'volume',
    label: VOLUME_METRIC_LABELS.distance,
    unit: 'km',
    formatAxis: (value) => formatKm(value, 0),
    formatValue: formatDistance,
    yDomain: FROM_ZERO,
    emptyDescription: NO_ACTIVITIES,
  },
  elevation: {
    id: 'elevation',
    group: 'training',
    kind: 'volume',
    label: VOLUME_METRIC_LABELS.elevation,
    unit: 'm',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: formatElevation,
    yDomain: FROM_ZERO,
    emptyDescription: NO_ACTIVITIES,
  },
  load: {
    id: 'load',
    group: 'training',
    kind: 'measurement',
    label: VOLUME_METRIC_LABELS.load,
    unit: null,
    hint: 'Wert der Quelle',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: (value) => formatNumber(value, 1),
    yDomain: FROM_ZERO,
    emptyDescription:
      'Keine Aktivität in diesem Zeitraum hat einen Belastungswert der Quelle mitgebracht.',
  },
  avgPower: {
    id: 'avgPower',
    group: 'training',
    kind: 'measurement',
    label: 'Durchschnittsleistung',
    unit: 'W',
    hint: 'nach Dauer gewichtet',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: formatPower,
    yDomain: FROM_ZERO,
    emptyDescription: 'Keine Aktivität in diesem Zeitraum hat Leistungswerte aufgezeichnet.',
  },
  hrv: {
    id: 'hrv',
    group: 'health',
    kind: 'measurement',
    label: 'HRV',
    unit: 'ms',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: formatHrv,
    yDomain: AROUND_DATA,
    emptyDescription: 'Für diesen Zeitraum wurden keine HRV-Werte übertragen.',
  },
  restingHr: {
    id: 'restingHr',
    group: 'health',
    kind: 'measurement',
    label: 'Ruhepuls',
    unit: 'bpm',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: formatHeartRate,
    yDomain: AROUND_DATA,
    emptyDescription: 'Für diesen Zeitraum wurden keine Ruhepuls-Werte übertragen.',
  },
  sleep: {
    id: 'sleep',
    group: 'health',
    kind: 'measurement',
    label: 'Schlafdauer',
    unit: 'h',
    formatAxis: hours,
    formatValue: formatHoursMinutes,
    yDomain: FROM_ZERO,
    emptyDescription: 'Für diesen Zeitraum wurden keine Schlafphasen übertragen.',
  },
  recovery: {
    id: 'recovery',
    group: 'health',
    kind: 'measurement',
    label: 'Erholung',
    unit: '0–100',
    hint: 'Score der Quelle',
    formatAxis: (value) => formatNumber(value, 0),
    formatValue: (value) => formatNumber(value, 0),
    yDomain: SCORE_SCALE,
    emptyDescription: 'Für diesen Zeitraum liegt kein Erholungswert der Quelle vor.',
  },
  weight: {
    id: 'weight',
    group: 'health',
    kind: 'measurement',
    label: 'Gewicht',
    unit: 'kg',
    formatAxis: (value) => formatNumber(value, 1),
    formatValue: formatWeight,
    yDomain: AROUND_DATA,
    emptyDescription: 'Für diesen Zeitraum wurden keine Gewichtswerte übertragen.',
  },
}

export interface TrendMetricGroup {
  id: TrendMetricGroupId
  /** German group heading. */
  label: string
  metrics: readonly TrendMetricId[]
}

export const TREND_METRIC_GROUPS: readonly TrendMetricGroup[] = [
  {
    id: 'training',
    label: 'Training',
    metrics: ['duration', 'distance', 'elevation', 'load', 'avgPower'],
  },
  {
    id: 'health',
    label: 'Gesundheit',
    metrics: ['hrv', 'restingHr', 'sleep', 'recovery', 'weight'],
  },
]

export const TREND_METRIC_IDS: readonly TrendMetricId[] = TREND_METRIC_GROUPS.flatMap(
  (group) => group.metrics,
)

/** Three panels is what still reads as one picture on a laptop screen. */
export const MAX_TREND_METRICS = 3

/** Opens on a pair, so the correlation readout has something to say right away. */
export const DEFAULT_TREND_METRICS: readonly TrendMetricId[] = ['load', 'hrv']
