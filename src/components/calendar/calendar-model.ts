import { activityDayKey, summarizeDays } from '@/lib/analytics/weekly'
import { addDays, fromDayKey, startOfWeek, toDayKey } from '@/lib/date'
import type { Activity, ActivityType, DateRange, RecoveryMetric } from '@/lib/domain/types'
import { LOCALE } from '@/lib/format'

/**
 * Everything the calendar needs to turn a month key into a grid of days.
 *
 * The month lives in the URL (`?monat=2026-08`), so the page itself stays a
 * server component and only the navigation is interactive. Nothing here
 * invents a value: a day without activities has a real zero duration (no
 * training happened), while a day without a recovery measurement carries
 * `null` and simply renders no bar.
 */

/** Weeks start on Monday — de-AT convention, matching `startOfWeek`. */
export const WEEKDAY_HEADERS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

export const MONTH_PARAM = 'monat'

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ride: 'Radfahren',
  indoor_ride: 'Indoor Cycling',
  run: 'Laufen',
  hike: 'Wandern',
  strength: 'Krafttraining',
  other: 'Sonstiges',
}

/** Fixed display order, so the dot row never reshuffles between days. */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  'ride',
  'indoor_ride',
  'run',
  'hike',
  'strength',
  'other',
]

/**
 * Marker style per activity type. Colour alone never carries the meaning:
 * indoor rides and "Sonstiges" are hollow rings rather than filled dots, every
 * dot has a German title, and the day cell's accessible name spells the types
 * out in words.
 */
export const ACTIVITY_TYPE_DOT_CLASSES: Record<ActivityType, string> = {
  ride: 'bg-series-1',
  indoor_ride: 'border border-series-1',
  run: 'bg-series-2',
  hike: 'bg-series-3',
  strength: 'bg-axis',
  other: 'border border-axis',
}

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string
  dayNumber: number
  /** False for the leading/trailing days that only fill the first and last week. */
  inMonth: boolean
  isToday: boolean
  /** Total moving time of that day in seconds; 0 means "no training", not "unknown". */
  durationSec: number
  activityCount: number
  distanceM: number
  types: ActivityType[]
  /** Provider recovery score 0..100, or null when nothing was measured. */
  recoveryScore: number | null
}

export type CalendarWeek = CalendarDay[]

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value)
}

/** "2026-08-14" → "2026-08" */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7)
}

export function toMonthKey(value: Date): string {
  return monthKeyOf(toDayKey(value))
}

/** First day of the month, at local noon (DST-safe, like `fromDayKey`). */
export function monthStart(monthKey: string): Date {
  return fromDayKey(`${monthKey}-01`)
}

/** Falls back to the current month for a missing or malformed parameter. */
export function resolveMonthKey(value: string | string[] | undefined, today: Date): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return isMonthKey(candidate) ? candidate : toMonthKey(today)
}

export function shiftMonth(monthKey: string, delta: number): string {
  const start = monthStart(monthKey)
  return toMonthKey(new Date(start.getFullYear(), start.getMonth() + delta, 1, 12, 0, 0, 0))
}

/** "August 2026" */
export function formatMonthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(
    monthStart(monthKey),
  )
}

/** The month itself, half-open — the basis for the month totals in the subline. */
export function monthKeyRange(monthKey: string): DateRange {
  const start = monthStart(monthKey)
  const next = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12, 0, 0, 0)
  return { from: toDayKey(start), to: toDayKey(next) }
}

/**
 * The days the grid actually shows: from the Monday of the week containing the
 * 1st up to (excluding) the Monday after the week containing the last day. That
 * is five or six rows depending on the month — never a padded fixed six.
 */
export function calendarGridRange(monthKey: string): DateRange {
  const start = startOfWeek(monthStart(monthKey))
  const range = monthKeyRange(monthKey)
  const lastDay = addDays(fromDayKey(range.to), -1)
  const lastWeekStart = startOfWeek(lastDay)
  return { from: toDayKey(start), to: toDayKey(addDays(lastWeekStart, 7)) }
}

export interface BuildCalendarArgs {
  monthKey: string
  range: DateRange
  activities: Activity[]
  recovery: RecoveryMetric[]
  today: Date
}

export function buildCalendarWeeks({
  monthKey,
  range,
  activities,
  recovery,
  today,
}: BuildCalendarArgs): CalendarWeek[] {
  const todayKey = toDayKey(today)

  const typesByDay = new Map<string, Set<ActivityType>>()
  for (const activity of activities) {
    const key = activityDayKey(activity)
    const bucket = typesByDay.get(key)
    if (bucket === undefined) {
      typesByDay.set(key, new Set<ActivityType>([activity.type]))
    } else {
      bucket.add(activity.type)
    }
  }

  const recoveryByDay = new Map<string, number>()
  for (const entry of recovery) {
    if (entry.providerScore === null || !Number.isFinite(entry.providerScore)) continue
    if (recoveryByDay.has(entry.date)) continue
    recoveryByDay.set(entry.date, entry.providerScore)
  }

  const days: CalendarDay[] = summarizeDays(activities, range).map((bucket) => {
    const present = typesByDay.get(bucket.date)
    return {
      date: bucket.date,
      dayNumber: fromDayKey(bucket.date).getDate(),
      inMonth: monthKeyOf(bucket.date) === monthKey,
      isToday: bucket.date === todayKey,
      durationSec: bucket.durationSec,
      activityCount: bucket.activityCount,
      distanceM: bucket.distanceM,
      types:
        present === undefined
          ? []
          : ACTIVITY_TYPE_ORDER.filter((type) => present.has(type)),
      recoveryScore: recoveryByDay.get(bucket.date) ?? null,
    }
  })

  const weeks: CalendarWeek[] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }
  return weeks
}
