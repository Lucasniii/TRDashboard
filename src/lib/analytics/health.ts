import type {
  DailyHealthMetrics,
  DateRange,
  RecoveryMetric,
  SleepSession,
} from '@/lib/domain/types'
import { daysBetween } from '@/lib/date'

/**
 * Health series and trends. Every series has one entry per calendar day in the
 * range, so charts keep their gaps: a day without a measurement is `null` and
 * is never interpolated, carried forward or replaced by an average.
 */

export interface SeriesPoint {
  date: string
  value: number | null
}

export type DailyMetricKey =
  | 'hrvMs'
  | 'restingHeartRate'
  | 'respiratoryRate'
  | 'skinTemperatureC'
  | 'bloodOxygenPct'
  | 'weightKg'

function emptySeries(range: DateRange): SeriesPoint[] {
  return daysBetween(range).map((date) => ({ date, value: null }))
}

/** First non-null wins, so a later empty record cannot erase a measurement. */
function fill(
  range: DateRange,
  records: Array<{ date: string; value: number | null }>,
): SeriesPoint[] {
  const points = emptySeries(range)
  const index = new Map<string, SeriesPoint>()
  for (const point of points) index.set(point.date, point)
  for (const record of records) {
    const point = index.get(record.date)
    if (!point || point.value !== null) continue
    if (record.value === null || !Number.isFinite(record.value)) continue
    point.value = record.value
  }
  return points
}

export function metricSeries(
  daily: DailyHealthMetrics[],
  key: DailyMetricKey,
  range: DateRange,
): SeriesPoint[] {
  return fill(
    range,
    daily.map((entry) => ({ date: entry.date, value: entry[key] })),
  )
}

export function sleepSeries(sessions: SleepSession[], range: DateRange): SeriesPoint[] {
  return fill(
    range,
    sessions.map((session) => ({ date: session.date, value: session.durationSec })),
  )
}

export function recoverySeries(items: RecoveryMetric[], range: DateRange): SeriesPoint[] {
  return fill(
    range,
    items.map((item) => ({ date: item.date, value: item.providerScore })),
  )
}

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

function valuesOf(points: SeriesPoint[]): number[] {
  const values: number[] = []
  for (const point of points) {
    if (point.value !== null && Number.isFinite(point.value)) values.push(point.value)
  }
  return values
}

/** Trailing average over `window` days; days without a measurement are skipped. */
export function rollingAverage(points: SeriesPoint[], window: number): SeriesPoint[] {
  const size = Math.max(1, Math.trunc(window))
  return points.map((point, index) => ({
    date: point.date,
    value: meanOf(valuesOf(points.slice(Math.max(0, index - size + 1), index + 1))),
  }))
}

export function average(points: SeriesPoint[]): number | null {
  return meanOf(valuesOf(points))
}

export interface MetricTrend {
  current: number | null
  avg7: number | null
  avg30: number | null
  baseline: number | null
  deviationPct: number | null
  direction: 'up' | 'down' | 'flat'
  hasData: boolean
}

/** Below this relative deviation the trend counts as unchanged. */
const TREND_DEAD_BAND_PCT = 3

const EMPTY_TREND: MetricTrend = {
  current: null,
  avg7: null,
  avg30: null,
  baseline: null,
  deviationPct: null,
  direction: 'flat',
  hasData: false,
}

export function metricTrend(points: SeriesPoint[]): MetricTrend {
  const measured = points.filter((point) => point.value !== null && Number.isFinite(point.value))
  if (measured.length === 0) return { ...EMPTY_TREND }

  const last = measured[measured.length - 1]
  const avg7 = average(points.slice(-7))
  const avg30 = average(points.slice(-30))
  // Baseline is the personal normal: the last 60 days that actually carry a
  // measurement, so a gap in the data widens the window instead of skewing it.
  const baseline = average(measured.slice(-60))

  const deviationPct =
    avg7 !== null && baseline !== null && baseline !== 0
      ? ((avg7 - baseline) / baseline) * 100
      : null

  const direction: MetricTrend['direction'] =
    deviationPct === null || Math.abs(deviationPct) <= TREND_DEAD_BAND_PCT
      ? 'flat'
      : deviationPct > 0
        ? 'up'
        : 'down'

  return {
    current: last?.value ?? null,
    avg7,
    avg30,
    baseline,
    deviationPct,
    direction,
    hasData: true,
  }
}

export interface Readiness {
  score: number
  label: string
  isDerived: true
  inputs: { hrv: boolean; restingHr: boolean; sleep: boolean; load: boolean }
}

/**
 * Weights of the readiness estimate. HRV carries the most signal, resting heart
 * rate confirms it, sleep and recent load only shade the result:
 *   HRV deviation 45 %, resting-HR deviation 25 %, sleep 20 %, recent load 10 %.
 * Missing optional inputs drop out and the remaining weights are renormalized,
 * so a day without sleep data is not punished as a night without sleep.
 */
const READINESS_WEIGHTS = { hrv: 45, restingHr: 25, sleep: 20, load: 10 } as const

/** Deviation in percent that moves a component from neutral (50) to its extreme. */
const HRV_FULL_SWING_PCT = 20
const RESTING_HR_FULL_SWING_PCT = 10
/** Sleep target the sleep component scores against, in seconds (8 h). */
const SLEEP_TARGET_SEC = 8 * 3600
/** Recent load that halves the load component; twice that scores 0. */
const LOAD_REFERENCE = 500

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readinessLabel(score: number): string {
  if (score >= 80) return 'Sehr gut erholt'
  if (score >= 65) return 'Gut erholt'
  if (score >= 45) return 'Normal'
  if (score >= 30) return 'Ermüdet'
  return 'Stark ermüdet'
}

/**
 * Our own estimate, never a provider score — the flag `isDerived` exists so the
 * UI can label it "berechnet". Returns null unless HRV and resting heart rate
 * are both present; guessing readiness from sleep alone would be invention.
 */
export function deriveReadiness(args: {
  hrv: MetricTrend
  restingHr: MetricTrend
  sleepSec: number | null
  recentLoad: number | null
}): Readiness | null {
  const { hrv, restingHr, sleepSec, recentLoad } = args
  if (!hrv.hasData || !restingHr.hasData) return null

  const parts: Array<{ weight: number; value: number }> = []

  // Higher HRV than baseline reads as recovered.
  const hrvDeviation = hrv.deviationPct ?? 0
  parts.push({
    weight: READINESS_WEIGHTS.hrv,
    value: clamp(50 + (hrvDeviation / HRV_FULL_SWING_PCT) * 50, 0, 100),
  })

  // Resting heart rate runs the other way: above baseline means strained.
  const restingDeviation = restingHr.deviationPct ?? 0
  parts.push({
    weight: READINESS_WEIGHTS.restingHr,
    value: clamp(50 - (restingDeviation / RESTING_HR_FULL_SWING_PCT) * 50, 0, 100),
  })

  const hasSleep = sleepSec !== null && Number.isFinite(sleepSec)
  if (hasSleep) {
    parts.push({
      weight: READINESS_WEIGHTS.sleep,
      value: clamp((sleepSec / SLEEP_TARGET_SEC) * 100, 0, 100),
    })
  }

  const hasLoad = recentLoad !== null && Number.isFinite(recentLoad)
  if (hasLoad) {
    parts.push({
      weight: READINESS_WEIGHTS.load,
      value: clamp(100 - (recentLoad / LOAD_REFERENCE) * 50, 0, 100),
    })
  }

  let weighted = 0
  let weight = 0
  for (const part of parts) {
    weighted += part.weight * part.value
    weight += part.weight
  }
  const score = weight > 0 ? clamp(Math.round(weighted / weight), 0, 100) : 50

  return {
    score,
    label: readinessLabel(score),
    isDerived: true,
    inputs: { hrv: true, restingHr: true, sleep: hasSleep, load: hasLoad },
  }
}
