import type { Activity, DateRange, WeeklyGoals, ZoneSeconds } from '@/lib/domain/types'
import { daysBetween, rangeContains, toDayKey } from '@/lib/date'
import { formatDurationClock, formatKm, formatNumber } from '@/lib/format'

/**
 * Week aggregation for the dashboard tiles and the goal rings.
 *
 * Two kinds of totals live here and they must not be confused:
 * volume totals (duration, distance, elevation) are plain numbers, because a
 * week without training is a real zero; metric totals (calories, load, power)
 * are nullable, because "no provider ever reported this" is not zero.
 */

export interface WeekSummary {
  range: DateRange
  activityCount: number
  distanceM: number
  durationSec: number
  elevationGainM: number
  calories: number | null
  trainingLoad: number | null
  avgPower: number | null
  hrZoneSec: ZoneSeconds
  powerZoneSec: ZoneSeconds
}

type ZoneTotals = [number, number, number, number, number]

function emptyZoneTotals(): ZoneTotals {
  return [0, 0, 0, 0, 0]
}

function addZones(target: ZoneTotals, source: ZoneSeconds | null): void {
  if (!source) return
  for (let i = 0; i < 5; i += 1) {
    target[i] = (target[i] ?? 0) + (source[i] ?? 0)
  }
}

function sealZones(totals: ZoneTotals): ZoneSeconds {
  return [totals[0], totals[1], totals[2], totals[3], totals[4]] as const
}

/** Local day key of an activity — the day the user filed it under. */
export function activityDayKey(activity: Activity): string {
  return toDayKey(new Date(activity.startedAt))
}

export function activitiesInRange(activities: Activity[], range: DateRange): Activity[] {
  return activities.filter((activity) => rangeContains(range, activityDayKey(activity)))
}

export function summarizeWeek(activities: Activity[], range: DateRange): WeekSummary {
  const inRange = activitiesInRange(activities, range)

  let distanceM = 0
  let durationSec = 0
  let elevationGainM = 0

  let calories: number | null = null
  let trainingLoad: number | null = null

  // Power is averaged over time, not over activities: a 4 h ride must outweigh
  // a 20 min spin.
  let powerWeighted = 0
  let powerWeight = 0
  let powerPlain = 0
  let powerCount = 0

  const hrZones = emptyZoneTotals()
  const powerZones = emptyZoneTotals()

  for (const activity of inRange) {
    durationSec += activity.durationSec
    distanceM += activity.distanceM ?? 0
    elevationGainM += activity.elevationGainM ?? 0

    if (activity.calories !== null) calories = (calories ?? 0) + activity.calories
    if (activity.trainingLoad !== null) trainingLoad = (trainingLoad ?? 0) + activity.trainingLoad

    if (activity.avgPower !== null) {
      powerPlain += activity.avgPower
      powerCount += 1
      if (activity.durationSec > 0) {
        powerWeighted += activity.avgPower * activity.durationSec
        powerWeight += activity.durationSec
      }
    }

    addZones(hrZones, activity.hrZoneSec)
    addZones(powerZones, activity.powerZoneSec)
  }

  const avgPower =
    powerWeight > 0 ? powerWeighted / powerWeight : powerCount > 0 ? powerPlain / powerCount : null

  return {
    range,
    activityCount: inRange.length,
    distanceM,
    durationSec,
    elevationGainM,
    calories,
    trainingLoad,
    avgPower,
    hrZoneSec: sealZones(hrZones),
    powerZoneSec: sealZones(powerZones),
  }
}

export interface Comparison {
  current: number
  previous: number
  /** null when the previous value is 0 — a change from nothing has no percentage. */
  deltaPct: number | null
}

export function compare(current: number, previous: number): Comparison {
  const usable = Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
  return {
    current,
    previous,
    deltaPct: usable ? ((current - previous) / previous) * 100 : null,
  }
}

export interface GoalProgress {
  key: 'duration' | 'distance' | 'elevation'
  label: string
  current: number
  goal: number | null
  /** Raw percentage, may exceed 100. The UI clamps the bar, not the number. */
  pct: number | null
  valueLabel: string
  goalLabel: string
}

export function goalProgress(summary: WeekSummary, goals: WeeklyGoals): GoalProgress[] {
  const rows: GoalProgress[] = [
    {
      key: 'duration',
      label: 'Trainingszeit',
      current: summary.durationSec,
      goal: goals.durationSec,
      pct: null,
      valueLabel: formatDurationClock(summary.durationSec),
      goalLabel: formatDurationClock(goals.durationSec),
    },
    {
      key: 'distance',
      label: 'Kilometer',
      current: summary.distanceM,
      goal: goals.distanceM,
      pct: null,
      valueLabel: formatKm(summary.distanceM),
      goalLabel: formatKm(goals.distanceM),
    },
    {
      key: 'elevation',
      label: 'Höhenmeter',
      current: summary.elevationGainM,
      goal: goals.elevationGainM,
      pct: null,
      valueLabel: formatNumber(summary.elevationGainM),
      goalLabel: formatNumber(goals.elevationGainM),
    },
  ]

  return rows.map((row) => ({
    ...row,
    pct: row.goal !== null && row.goal > 0 ? (row.current / row.goal) * 100 : null,
  }))
}

export function summarizeDays(
  activities: Activity[],
  range: DateRange,
): Array<{
  date: string
  distanceM: number
  durationSec: number
  elevationGainM: number
  activityCount: number
}> {
  const buckets = new Map<
    string,
    { date: string; distanceM: number; durationSec: number; elevationGainM: number; activityCount: number }
  >()

  for (const date of daysBetween(range)) {
    buckets.set(date, { date, distanceM: 0, durationSec: 0, elevationGainM: 0, activityCount: 0 })
  }

  for (const activity of activities) {
    const bucket = buckets.get(activityDayKey(activity))
    if (!bucket) continue
    bucket.activityCount += 1
    bucket.durationSec += activity.durationSec
    bucket.distanceM += activity.distanceM ?? 0
    bucket.elevationGainM += activity.elevationGainM ?? 0
  }

  return [...buckets.values()]
}
