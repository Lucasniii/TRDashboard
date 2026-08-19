import type { SeriesPoint } from '@/lib/analytics/health'
import { rollingAverage } from '@/lib/analytics/health'
import {
  PERIOD_LABELS,
  fromDayKey,
  isoWeekNumber,
  rangeContains,
  startOfWeek,
  toDayKey,
} from '@/lib/date'
import type { DateRange, ProviderId, SleepSession } from '@/lib/domain/types'
import {
  NO_DATA,
  formatDayMonth,
  formatHeartRate,
  formatHoursMinutes,
  formatHrv,
  formatNumber,
} from '@/lib/format'

/**
 * Page-level helpers for Gesundheit. Everything here is pure and free of React,
 * so the server components and the small client charts can share it.
 *
 * The rule of the whole page holds in this file too: a missing measurement is
 * null and stays null. Nothing is interpolated, carried forward or averaged
 * into existence — a gap is rendered as "keine Daten".
 */

// ── period selection ─────────────────────────────────────────────────────────

/** Query parameter that carries the selected period, e.g. /gesundheit?zeitraum=30d. */
export const PERIOD_PARAM = 'zeitraum'

/** "Gesamt" is deliberately absent: the health charts are read per period. */
export const HEALTH_PERIODS = ['7d', '30d', '3m', '6m', '1y'] as const

export type HealthPeriod = (typeof HEALTH_PERIODS)[number]

export const DEFAULT_HEALTH_PERIOD: HealthPeriod = '30d'

export const HEALTH_PERIOD_OPTIONS: ReadonlyArray<{ value: HealthPeriod; label: string }> =
  HEALTH_PERIODS.map((period) => ({ value: period, label: PERIOD_LABELS[period] }))

export function healthPeriodLabel(period: HealthPeriod): string {
  return PERIOD_LABELS[period]
}

/** Anything unknown in the URL falls back to the default instead of erroring. */
export function parseHealthPeriod(raw: string | string[] | undefined): HealthPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw
  return HEALTH_PERIODS.find((period) => period === value) ?? DEFAULT_HEALTH_PERIOD
}

/** Nightly bars stay readable up to a month; longer periods need weeks. */
export type SleepGranularity = 'nightly' | 'weekly'

export function sleepGranularityFor(period: HealthPeriod): SleepGranularity {
  return period === '7d' || period === '30d' ? 'nightly' : 'weekly'
}

// ── formatting ───────────────────────────────────────────────────────────────

export type MetricUnit = 'hrv' | 'heartRate' | 'score' | 'duration'

export type MetricFormatter = (value: number | null | undefined) => string

/** One lookup both the server tiles and the client charts format through. */
export function metricFormatter(unit: MetricUnit): MetricFormatter {
  switch (unit) {
    case 'hrv':
      return formatHrv
    case 'heartRate':
      return formatHeartRate
    case 'duration':
      return formatHoursMinutes
    case 'score':
      return (value) => formatNumber(value)
  }
}

/** StatTile wants a string or null — never the placeholder as a "value". */
export function tileValue(value: number | null, format: MetricFormatter): string | null {
  return value === null || !Number.isFinite(value) ? null : format(value)
}

// ── series helpers ───────────────────────────────────────────────────────────

export interface TrendRow {
  date: string
  value: number | null
  avg7: number | null
}

/**
 * Daily values plus their trailing 7-day mean, cut to the visible range. The
 * rolling average is computed on the padded series first, so the left edge of
 * the chart carries a real average instead of a ramp-up artefact.
 */
export function trendRows(points: readonly SeriesPoint[], range: DateRange): TrendRow[] {
  const averages = rollingAverage([...points], 7)
  const rows: TrendRow[] = []
  points.forEach((point, index) => {
    if (!rangeContains(range, point.date)) return
    rows.push({ date: point.date, value: point.value, avg7: averages[index]?.value ?? null })
  })
  return rows
}

export function latestMeasured(points: readonly SeriesPoint[]): SeriesPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point !== undefined && point.value !== null && Number.isFinite(point.value)) return point
  }
  return null
}

export function valueOn(points: readonly SeriesPoint[], date: string): number | null {
  const match = points.find((point) => point.date === date)
  if (match === undefined || match.value === null || !Number.isFinite(match.value)) return null
  return match.value
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

/** Sample standard deviation. Fewer than two nights say nothing about spread. */
export function standardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const average = mean(values)
  if (average === null) return null
  let sum = 0
  for (const value of values) sum += (value - average) ** 2
  return Math.sqrt(sum / (values.length - 1))
}

// ── wall clock ───────────────────────────────────────────────────────────────

const WALL_CLOCK_PATTERN = /T(\d{2}):(\d{2})/

/**
 * Minutes since midnight read straight off the timestamp's own offset. The
 * server and the browser may sit in different timezones; the recorded wall
 * clock does not, so bedtimes never shift between render passes.
 */
export function wallClockMinutes(iso: string): number | null {
  const match = WALL_CLOCK_PATTERN.exec(iso)
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

export function clockLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return NO_DATA
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(wrapped / 60)
  const minute = wrapped % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Bedtimes straddle midnight, so they are kept as a signed offset around it:
 * 22:47 → −73, 00:20 → +20. Averaging and spread only work on that scale.
 */
export function bedtimeOffset(iso: string): number | null {
  const minutes = wallClockMinutes(iso)
  if (minutes === null) return null
  return minutes >= 12 * 60 ? minutes - 1440 : minutes
}

// ── sleep ────────────────────────────────────────────────────────────────────

export interface SleepSummary {
  /** Most recent night in the selected period, or null when there is none. */
  latest: SleepSession | null
  nightCount: number
  avgDurationSec: number | null
  avgBedtimeOffset: number | null
  avgWakeMinutes: number | null
  /** Spread of the bedtime in minutes — labelled, never sold as a score. */
  bedtimeStdDevMin: number | null
  latestSleepScore: number | null
  /** True when at least one night in the period carries a provider score. */
  hasSleepScore: boolean
  sleepScoreProvider: ProviderId | null
}

export function summarizeSleep(sessions: readonly SleepSession[]): SleepSummary {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const latest = sorted[sorted.length - 1] ?? null

  const durations: number[] = []
  const bedtimes: number[] = []
  const wakeTimes: number[] = []
  let hasSleepScore = false
  let sleepScoreProvider: ProviderId | null = null

  for (const session of sorted) {
    if (Number.isFinite(session.durationSec)) durations.push(session.durationSec)
    const bedtime = bedtimeOffset(session.startedAt)
    if (bedtime !== null) bedtimes.push(bedtime)
    const wake = wallClockMinutes(session.endedAt)
    if (wake !== null) wakeTimes.push(wake)
    if (session.sleepScore !== null && Number.isFinite(session.sleepScore)) {
      hasSleepScore = true
      sleepScoreProvider = session.source.provider
    }
  }

  return {
    latest,
    nightCount: sorted.length,
    avgDurationSec: mean(durations),
    avgBedtimeOffset: mean(bedtimes),
    avgWakeMinutes: mean(wakeTimes),
    bedtimeStdDevMin: standardDeviation(bedtimes),
    latestSleepScore: latest?.sleepScore ?? null,
    hasSleepScore,
    sleepScoreProvider,
  }
}

export interface SleepBarRow {
  /** Day key for nightly bars, week-start day key for weekly bars. */
  key: string
  value: number | null
  /** The most recent bar carrying a value — emphasised and directly labelled. */
  isLatest: boolean
}

function markLatest(rows: SleepBarRow[]): SleepBarRow[] {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row !== undefined && row.value !== null) {
      row.isLatest = true
      break
    }
  }
  return rows
}

/**
 * Nightly durations, or — over longer periods — the mean duration of the nights
 * that were actually measured in each calendar week. A week without a single
 * measurement stays null and simply has no bar.
 */
export function sleepBars(
  points: readonly SeriesPoint[],
  granularity: SleepGranularity,
): SleepBarRow[] {
  if (granularity === 'nightly') {
    return markLatest(
      points.map((point) => ({ key: point.date, value: point.value, isLatest: false })),
    )
  }

  const groups = new Map<string, number[]>()
  const order: string[] = []
  for (const point of points) {
    const weekKey = toDayKey(startOfWeek(point.date))
    let values = groups.get(weekKey)
    if (values === undefined) {
      values = []
      groups.set(weekKey, values)
      order.push(weekKey)
    }
    if (point.value !== null && Number.isFinite(point.value)) values.push(point.value)
  }

  return markLatest(
    order.map((weekKey) => ({
      key: weekKey,
      value: mean(groups.get(weekKey) ?? []),
      isLatest: false,
    })),
  )
}

export function sleepBarLabel(granularity: SleepGranularity, key: string): string {
  if (granularity === 'nightly') return formatDayMonth(fromDayKey(key))
  return `KW ${String(isoWeekNumber(key))}`
}

// ── provenance ───────────────────────────────────────────────────────────────

const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  whoop: 'WHOOP',
  wahoo: 'Wahoo',
  strava: 'Strava',
  garmin: 'Garmin Connect',
  apple_health: 'Apple Health',
  wub: 'WUB',
  csv: 'CSV-Import',
  manual: 'Manuelle Eingabe',
  mock: 'Demodaten',
}

/** "Wert von WHOOP", "Demodaten" — the reader always sees where a score is from. */
export function sourceLabel(provider: ProviderId | null): string {
  if (provider === null) return NO_DATA
  if (provider === 'mock') return 'Demodaten'
  if (provider === 'manual') return 'Manuelle Eingabe'
  return `Wert von ${PROVIDER_DISPLAY_NAMES[provider]}`
}

/** Joins a German enumeration: "HRV, Ruhepuls und Schlafdauer". */
export function joinGerman(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1] ?? ''}`
}
