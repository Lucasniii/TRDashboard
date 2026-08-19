import { metricSeries, recoverySeries, sleepSeries } from '@/lib/analytics/health'
import type { SeriesPoint } from '@/lib/analytics/health'
import { activityDayKey, summarizeWeek } from '@/lib/analytics/weekly'
import { addDays, daysBetween, toDayKey } from '@/lib/date'
import type {
  Activity,
  DailyHealthMetrics,
  DateRange,
  RecoveryMetric,
  SleepSession,
} from '@/lib/domain/types'
import type { TrendMetricId } from '@/components/trends/metrics'

/**
 * The page loads its whole history once on the server and hands the client this
 * one compact table: a day key column and one aligned column per metric. The
 * period picker then only slices it, which keeps switching periods instant and
 * keeps the payload to plain numbers instead of full records.
 *
 * Nothing in here fills a gap. A day a provider never reported stays null all
 * the way into the chart.
 */

export interface TrendDataset {
  /** Every covered day, ascending. Index i of every value column is this day. */
  days: readonly string[]
  values: Readonly<Record<TrendMetricId, ReadonlyArray<number | null>>>
  /**
   * Recorded activities per day. It separates a genuine rest day (0 volume)
   * from a stretch without any activity records at all, which is not a zero
   * but an absence — the panels show an empty state for the latter.
   */
  activityCount: readonly number[]
  /** Earliest record in the store, the lower bound of the "Gesamt" period. */
  earliest: string | null
  /** The server's today, so the client derives the same ranges. */
  todayKey: string
}

export interface TrendDatasetInput {
  activities: Activity[]
  daily: DailyHealthMetrics[]
  sleep: SleepSession[]
  recovery: RecoveryMetric[]
  range: DateRange
  todayKey: string
  earliest: string | null
}

function valuesOf(points: SeriesPoint[]): Array<number | null> {
  return points.map((point) => point.value)
}

export function buildTrendDataset(input: TrendDatasetInput): TrendDataset {
  const { activities, daily, sleep, recovery, range, todayKey, earliest } = input
  const days = daysBetween(range)

  const byDay = new Map<string, Activity[]>()
  for (const activity of activities) {
    const key = activityDayKey(activity)
    const bucket = byDay.get(key)
    if (bucket === undefined) byDay.set(key, [activity])
    else bucket.push(activity)
  }

  const duration: Array<number | null> = []
  const distance: Array<number | null> = []
  const elevation: Array<number | null> = []
  const load: Array<number | null> = []
  const avgPower: Array<number | null> = []
  const activityCount: number[] = []

  for (const day of days) {
    // One day is just a one-day week: reusing the summary keeps the volume /
    // measurement distinction identical to every other aggregate in the app.
    const summary = summarizeWeek(byDay.get(day) ?? [], {
      from: day,
      to: toDayKey(addDays(day, 1)),
    })
    duration.push(summary.durationSec)
    distance.push(summary.distanceM)
    elevation.push(summary.elevationGainM)
    load.push(summary.trainingLoad)
    avgPower.push(summary.avgPower)
    activityCount.push(summary.activityCount)
  }

  return {
    days,
    activityCount,
    earliest,
    todayKey,
    values: {
      duration,
      distance,
      elevation,
      load,
      avgPower,
      hrv: valuesOf(metricSeries(daily, 'hrvMs', range)),
      restingHr: valuesOf(metricSeries(daily, 'restingHeartRate', range)),
      sleep: valuesOf(sleepSeries(sleep, range)),
      recovery: valuesOf(recoverySeries(recovery, range)),
      weight: valuesOf(metricSeries(daily, 'weightKg', range)),
    },
  }
}
