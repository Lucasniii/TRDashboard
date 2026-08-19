import type { DateRange } from '@/lib/domain/types'

/**
 * Day keys are plain YYYY-MM-DD strings in local time. Weeks start on Monday
 * (de-AT convention), and every range is half-open: [from, to).
 */

export type PeriodKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d': '7 Tage',
  '30d': '30 Tage',
  '3m': '3 Monate',
  '6m': '6 Monate',
  '1y': '1 Jahr',
  all: 'Gesamt',
}

export function toDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parses a day key at local noon, which keeps DST shifts from moving the day. */
export function fromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0)
}

export function addDays(value: Date | string, count: number): Date {
  const date = value instanceof Date ? new Date(value) : fromDayKey(value)
  date.setDate(date.getDate() + count)
  return date
}

export function startOfWeek(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : fromDayKey(value)
  date.setHours(12, 0, 0, 0)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return date
}

export function weekRange(value: Date | string): DateRange {
  const start = startOfWeek(value)
  return { from: toDayKey(start), to: toDayKey(addDays(start, 7)) }
}

/** ISO week number, for calendar headings like "KW 34". */
export function isoWeekNumber(value: Date | string): number {
  const date = value instanceof Date ? new Date(value) : fromDayKey(value)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const firstThursday = new Date(date.getFullYear(), 0, 4, 12, 0, 0, 0)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

export function startOfMonth(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : fromDayKey(value)
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0)
}

export function monthRange(value: Date | string): DateRange {
  const start = startOfMonth(value)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12, 0, 0, 0)
  return { from: toDayKey(start), to: toDayKey(end) }
}

export function daysBetween(range: DateRange): string[] {
  const days: string[] = []
  let cursor = fromDayKey(range.from)
  const end = fromDayKey(range.to)
  while (cursor.getTime() < end.getTime()) {
    days.push(toDayKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return days
}

export function rangeContains(range: DateRange, dayKey: string): boolean {
  return dayKey >= range.from && dayKey < range.to
}

/** Shifts a range back by its own length — the "Vorwoche"/previous-period basis. */
export function previousRange(range: DateRange): DateRange {
  const from = fromDayKey(range.from)
  const to = fromDayKey(range.to)
  const lengthDays = Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000))
  return { from: toDayKey(addDays(from, -lengthDays)), to: range.from }
}

export function periodToRange(period: PeriodKey, today: Date, earliest: string | null): DateRange {
  const to = toDayKey(addDays(today, 1))
  switch (period) {
    case '7d':
      return { from: toDayKey(addDays(today, -6)), to }
    case '30d':
      return { from: toDayKey(addDays(today, -29)), to }
    case '3m':
      return { from: toDayKey(addDays(today, -90)), to }
    case '6m':
      return { from: toDayKey(addDays(today, -181)), to }
    case '1y':
      return { from: toDayKey(addDays(today, -364)), to }
    case 'all':
      return { from: earliest ?? toDayKey(addDays(today, -364)), to }
  }
}

/** The last `count` week ranges, oldest first, ending with the week of `value`. */
export function lastWeekRanges(value: Date | string, count: number): DateRange[] {
  const current = startOfWeek(value)
  const ranges: DateRange[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = addDays(current, -7 * i)
    ranges.push({ from: toDayKey(start), to: toDayKey(addDays(start, 7)) })
  }
  return ranges
}
