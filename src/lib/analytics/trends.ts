import type { Activity, DateRange } from '@/lib/domain/types'
import { isoWeekNumber, rangeContains, toDayKey } from '@/lib/date'
import { summarizeWeek } from '@/lib/analytics/weekly'
import type { SeriesPoint } from '@/lib/analytics/health'

/** Long-range views: weekly volume bars and the correlation readouts. */

export type VolumeMetric = 'duration' | 'distance' | 'elevation' | 'load'

export const VOLUME_METRIC_LABELS: Record<VolumeMetric, string> = {
  duration: 'Trainingszeit',
  distance: 'Kilometer',
  elevation: 'Höhenmeter',
  load: 'Trainingsbelastung',
}

export interface WeeklyVolumePoint {
  weekStart: string
  /** "KW 34" */
  weekLabel: string
  /** The week `today` falls into — it is still incomplete and the UI says so. */
  isCurrent: boolean
  duration: number
  distance: number
  elevation: number
  load: number | null
}

export function weeklyVolume(
  activities: Activity[],
  ranges: DateRange[],
  today: Date,
): WeeklyVolumePoint[] {
  const todayKey = toDayKey(today)
  return ranges.map((range) => {
    const summary = summarizeWeek(activities, range)
    return {
      weekStart: range.from,
      weekLabel: `KW ${isoWeekNumber(range.from)}`,
      isCurrent: rangeContains(range, todayKey),
      duration: summary.durationSec,
      distance: summary.distanceM,
      elevation: summary.elevationGainM,
      load: summary.trainingLoad,
    }
  })
}

/** Fewer pairs than this and a correlation would be noise, not a finding. */
const MIN_CORRELATION_PAIRS = 8

/**
 * Pearson r over the days where both series carry a measurement. Null when
 * there are too few pairs or one series does not vary at all.
 */
export function correlate(a: SeriesPoint[], b: SeriesPoint[]): number | null {
  const byDate = new Map<string, number>()
  for (const point of a) {
    if (point.value !== null && Number.isFinite(point.value)) byDate.set(point.date, point.value)
  }

  const xs: number[] = []
  const ys: number[] = []
  for (const point of b) {
    if (point.value === null || !Number.isFinite(point.value)) continue
    const other = byDate.get(point.date)
    if (other === undefined) continue
    xs.push(other)
    ys.push(point.value)
  }

  const n = xs.length
  if (n < MIN_CORRELATION_PAIRS) return null

  let sumX = 0
  let sumY = 0
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i] ?? 0
    sumY += ys[i] ?? 0
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX
    const dy = (ys[i] ?? 0) - meanY
    covariance += dx * dy
    varianceX += dx * dx
    varianceY += dy * dy
  }

  const denominator = Math.sqrt(varianceX * varianceY)
  if (denominator === 0) return null
  return covariance / denominator
}
