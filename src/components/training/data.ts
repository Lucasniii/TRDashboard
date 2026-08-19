import { activitiesInRange, activityDayKey, summarizeWeek } from '@/lib/analytics/weekly'
import { aggregateZones } from '@/lib/analytics/zones'
import type { ZoneAggregate } from '@/lib/analytics/zones'
import { weeklyVolume } from '@/lib/analytics/trends'
import {
  addDays,
  daysBetween,
  fromDayKey,
  lastWeekRanges,
  previousRange,
  startOfWeek,
  toDayKey,
  weekRange,
} from '@/lib/date'
import { formatDateRangeLabel } from '@/lib/format'
import type { Activity, DateRange, UserSettings, ZoneKind } from '@/lib/domain/types'

/**
 * Everything the Training page computes on the server. The page hands the
 * finished, serializable shapes to its client panels, so switching a segmented
 * control never re-runs an aggregation over the whole activity list in the
 * browser — and the activity list itself never has to cross the wire.
 *
 * Nothing in here fills a gap. Volume totals are plain numbers because a week
 * without training is a real zero; load stays nullable because "no provider
 * ever reported a value" is not zero.
 */

/** Weeks in the "Wochenübersicht" bars and table. */
export const OVERVIEW_WEEKS = 12

/** Days in the daily load series the load panel slices its periods from. */
export const LOAD_WINDOW_DAYS = 84

/** The longest comparison on the page (previous 12 weeks) reaches back 24 weeks. */
const FETCH_WEEKS = 24

/** The single range the page reads from the repository. */
export function trainingPageRange(today: Date): DateRange {
  const currentWeekStart = startOfWeek(today)
  return {
    from: toDayKey(addDays(currentWeekStart, -7 * (FETCH_WEEKS - 1))),
    to: toDayKey(addDays(today, 1)),
  }
}

/** "11. – 17. August 2026" for a half-open range. */
function rangeLabel(range: DateRange): string {
  const lastDay = addDays(range.to, -1)
  return formatDateRangeLabel(fromDayKey(range.from), lastDay)
}

// ── Wochenübersicht ──────────────────────────────────────────────────────────

export interface WeekRow {
  weekStart: string
  /** "KW 34" */
  weekLabel: string
  /** "11. – 17. August 2026" */
  rangeLabel: string
  /** The running week — still incomplete, and the UI says so. */
  isCurrent: boolean
  durationSec: number
  distanceM: number
  elevationGainM: number
  /** Provider load, null when no activity of the week reported one. */
  load: number | null
  activityCount: number
}

export function buildWeekRows(activities: Activity[], today: Date): WeekRow[] {
  const ranges = lastWeekRanges(today, OVERVIEW_WEEKS)
  const points = weeklyVolume(activities, ranges, today)

  return points.map((point, index) => {
    const range = ranges[index]
    // weeklyVolume carries the volumes; the activity count comes from the same
    // week summary the analytics layer builds anyway.
    const summary = range === undefined ? null : summarizeWeek(activities, range)
    return {
      weekStart: point.weekStart,
      weekLabel: point.weekLabel,
      rangeLabel: range === undefined ? point.weekStart : rangeLabel(range),
      isCurrent: point.isCurrent,
      durationSec: point.duration,
      distanceM: point.distance,
      elevationGainM: point.elevation,
      load: point.load,
      activityCount: summary?.activityCount ?? 0,
    }
  })
}

// ── Trainingsbelastung ───────────────────────────────────────────────────────

export interface LoadPoint {
  date: string
  /** Sum of the provider load of that day's activities. */
  load: number | null
}

const LOAD_KIND_LABELS: Record<'whoop_strain' | 'tss' | 'trimp', string> = {
  whoop_strain: 'Whoop Strain',
  tss: 'TSS',
  trimp: 'TRIMP',
}

/**
 * Which load figure the data actually is. Never guessed: an activity without a
 * declared kind contributes nothing, and a range without any load at all
 * returns null so the panel can say so instead of labelling an empty axis.
 */
export function loadKindLabel(activities: Activity[]): string | null {
  const kinds = new Set<string>()
  for (const activity of activities) {
    if (activity.trainingLoad === null || activity.trainingLoadKind === null) continue
    kinds.add(LOAD_KIND_LABELS[activity.trainingLoadKind])
  }
  if (kinds.size === 0) return null
  return [...kinds].join(' · ')
}

/**
 * One entry per day of the load window.
 *
 * Three cases, and they must stay apart:
 *   • day before the first record → null, the provider did not cover it yet
 *   • covered day without any activity → 0, a real rest day
 *   • day with activities but no load value → null, nothing was reported
 */
export function buildLoadSeries(
  activities: Activity[],
  today: Date,
  coverageFrom: string | null,
): LoadPoint[] {
  const range: DateRange = {
    from: toDayKey(addDays(today, -(LOAD_WINDOW_DAYS - 1))),
    to: toDayKey(addDays(today, 1)),
  }

  const buckets = new Map<string, { load: number | null; activityCount: number }>()
  for (const date of daysBetween(range)) buckets.set(date, { load: null, activityCount: 0 })

  for (const activity of activitiesInRange(activities, range)) {
    const bucket = buckets.get(activityDayKey(activity))
    if (bucket === undefined) continue
    bucket.activityCount += 1
    const load = activity.trainingLoad
    if (load !== null && Number.isFinite(load)) bucket.load = (bucket.load ?? 0) + load
  }

  return daysBetween(range).map((date) => {
    if (coverageFrom !== null && date < coverageFrom) return { date, load: null }
    const bucket = buckets.get(date)
    if (bucket === undefined) return { date, load: null }
    if (bucket.activityCount === 0) return { date, load: 0 }
    return { date, load: bucket.load }
  })
}

// ── Zonenverteilung ──────────────────────────────────────────────────────────

export type ZonePeriodKey = 'this_week' | 'last_week' | 'last_4w' | 'last_12w'

const ZONE_PERIOD_ORDER: readonly ZonePeriodKey[] = [
  'this_week',
  'last_week',
  'last_4w',
  'last_12w',
]

const ZONE_PERIOD_LABELS: Record<ZonePeriodKey, string> = {
  this_week: 'Diese Woche',
  last_week: 'Letzte Woche',
  last_4w: 'Letzte 4 Wochen',
  last_12w: 'Letzte 12 Wochen',
}

/** The equivalent span directly before the selected one. */
const ZONE_PREVIOUS_LABELS: Record<ZonePeriodKey, string> = {
  this_week: 'Vorwoche',
  last_week: 'Woche davor',
  last_4w: '4 Wochen davor',
  last_12w: '12 Wochen davor',
}

export interface ZoneComparison {
  period: ZonePeriodKey
  kind: ZoneKind
  /** "Letzte 4 Wochen" */
  periodLabel: string
  /** "4 Wochen davor" */
  previousLabel: string
  currentRangeLabel: string
  previousRangeLabel: string
  current: ZoneAggregate
  previous: ZoneAggregate
}

/** The last `count` whole weeks including the running one. */
function trailingWeeks(today: Date, count: number): DateRange {
  const start = startOfWeek(today)
  return { from: toDayKey(addDays(start, -7 * (count - 1))), to: toDayKey(addDays(start, 7)) }
}

function zonePeriodRange(period: ZonePeriodKey, today: Date): DateRange {
  switch (period) {
    case 'this_week':
      return weekRange(today)
    case 'last_week':
      return weekRange(addDays(today, -7))
    case 'last_4w':
      return trailingWeeks(today, 4)
    case 'last_12w':
      return trailingWeeks(today, 12)
  }
}

/**
 * All four periods in both zone kinds, each against its own previous period.
 * Eight small aggregates — cheaper to ship than the activities they came from.
 */
export function buildZoneComparisons(
  activities: Activity[],
  settings: UserSettings,
  today: Date,
): ZoneComparison[] {
  const kinds: readonly ZoneKind[] = ['heart_rate', 'power']
  const comparisons: ZoneComparison[] = []

  for (const period of ZONE_PERIOD_ORDER) {
    const range = zonePeriodRange(period, today)
    const previous = previousRange(range)
    const inRange = activitiesInRange(activities, range)
    const inPrevious = activitiesInRange(activities, previous)

    for (const kind of kinds) {
      const zones = kind === 'power' ? settings.powerZones : settings.heartRateZones
      comparisons.push({
        period,
        kind,
        periodLabel: ZONE_PERIOD_LABELS[period],
        previousLabel: ZONE_PREVIOUS_LABELS[period],
        currentRangeLabel: rangeLabel(range),
        previousRangeLabel: rangeLabel(previous),
        current: aggregateZones(inRange, kind, zones),
        previous: aggregateZones(inPrevious, kind, zones),
      })
    }
  }

  return comparisons
}
