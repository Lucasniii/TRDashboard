import { toDayKey } from '@/lib/date'
import type {
  Activity,
  ActivityType,
  DailyHealthMetrics,
  ProviderId,
  RecoveryMetric,
  SleepSession,
  SourceRef,
  ZoneSeconds,
} from '@/lib/domain/types'

/**
 * Pure normalizers: raw provider JSON in, internal model out. No network, no
 * environment, no clock of their own — every timestamp the caller needs is
 * passed in via `MappingContext`, which keeps the functions testable.
 *
 * Two rules run through the whole file:
 *   1. A metric the provider did not report becomes `null`, never 0.
 *   2. A record we cannot describe honestly (no start, no scored sleep stages)
 *      is dropped by returning `null` rather than filled with a guess.
 */

/**
 * The app has one athlete until accounts arrive with the database in Phase 3.
 * The sync layer passes the real owner once there is one.
 */
export const DEFAULT_USER_ID = 'local'

export interface MappingContext {
  userId: string
  /** ISO timestamp written into every SourceRef of this sync run. */
  syncedAt: string
}

/** German activity names, used whenever the provider has no name of its own. */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ride: 'Radfahren',
  indoor_ride: 'Indoor Cycling',
  run: 'Laufen',
  hike: 'Wandern',
  strength: 'Krafttraining',
  other: 'Sonstiges',
}

type NumericLike = number | string | null | undefined

/** Wahoo sends its summary numbers as strings, WHOOP as numbers. */
function toNumber(value: NumericLike): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * For metrics where a reported 0 means "no sensor" rather than a measurement:
 * an average heart rate of 0 bpm was never measured, and showing "keine Daten"
 * is the honest rendering.
 */
function positiveOrNull(value: NumericLike): number | null {
  const parsed = toNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function round(value: number | null, digits: number): number | null {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function milliToSeconds(value: NumericLike): number {
  const parsed = toNumber(value)
  return parsed === null ? 0 : Math.round(parsed / 1000)
}

/** WHOOP reports energy in kilojoule; the UI shows Kalorien. */
function kilojouleToCalories(value: NumericLike): number | null {
  const parsed = positiveOrNull(value)
  return parsed === null ? null : Math.round(parsed / 4.184)
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function secondsBetween(startIso: string, endIso: string | null): number | null {
  if (endIso === null) return null
  const seconds = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function sourceRef(provider: ProviderId, recordId: string, ctx: MappingContext): SourceRef {
  return { provider, recordId, syncedAt: ctx.syncedAt }
}

/** Stable across syncs, so re-importing a record updates instead of duplicating. */
function domainId(provider: ProviderId, kind: string, recordId: string): string {
  return `${provider}:${kind}:${recordId}`
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/* ------------------------------------------------------------------ WHOOP */

export interface WhoopZoneDurations {
  zone_zero_milli?: NumericLike
  zone_one_milli?: NumericLike
  zone_two_milli?: NumericLike
  zone_three_milli?: NumericLike
  zone_four_milli?: NumericLike
  zone_five_milli?: NumericLike
}

export interface WhoopWorkoutScore {
  strain?: NumericLike
  average_heart_rate?: NumericLike
  max_heart_rate?: NumericLike
  kilojoule?: NumericLike
  percent_recorded?: NumericLike
  distance_meter?: NumericLike
  altitude_gain_meter?: NumericLike
  altitude_change_meter?: NumericLike
  zone_durations?: WhoopZoneDurations | null
}

export interface WhoopWorkoutRecord {
  /** v2 hands out a UUID; v1 used a number. */
  id?: string | number | null
  sport_name?: string | null
  sport_id?: number | null
  start?: string | null
  end?: string | null
  /** UTC offset like "+02:00", not an IANA zone name. */
  timezone_offset?: string | null
  score_state?: string | null
  score?: WhoopWorkoutScore | null
}

export interface WhoopRecoveryScore {
  user_calibrating?: boolean | null
  recovery_score?: NumericLike
  resting_heart_rate?: NumericLike
  hrv_rmssd_milli?: NumericLike
  spo2_percentage?: NumericLike
  skin_temp_celsius?: NumericLike
}

export interface WhoopRecoveryRecord {
  /** Recovery rows carry no id of their own — the cycle identifies them. */
  cycle_id?: string | number | null
  sleep_id?: string | number | null
  created_at?: string | null
  updated_at?: string | null
  score_state?: string | null
  score?: WhoopRecoveryScore | null
}

export interface WhoopSleepStageSummary {
  total_in_bed_time_milli?: NumericLike
  total_awake_time_milli?: NumericLike
  total_no_data_time_milli?: NumericLike
  total_light_sleep_time_milli?: NumericLike
  total_slow_wave_sleep_time_milli?: NumericLike
  total_rem_sleep_time_milli?: NumericLike
  sleep_cycle_count?: NumericLike
  disturbance_count?: NumericLike
}

export interface WhoopSleepScore {
  stage_summary?: WhoopSleepStageSummary | null
  sleep_performance_percentage?: NumericLike
  sleep_efficiency_percentage?: NumericLike
  respiratory_rate?: NumericLike
}

export interface WhoopSleepRecord {
  id?: string | number | null
  cycle_id?: string | number | null
  start?: string | null
  end?: string | null
  timezone_offset?: string | null
  nap?: boolean | null
  score_state?: string | null
  score?: WhoopSleepScore | null
}

export interface WhoopCycleScore {
  strain?: NumericLike
  kilojoule?: NumericLike
  average_heart_rate?: NumericLike
  max_heart_rate?: NumericLike
}

export interface WhoopCycleRecord {
  id?: string | number | null
  start?: string | null
  end?: string | null
  timezone_offset?: string | null
  score_state?: string | null
  score?: WhoopCycleScore | null
}

/** WHOOP sport names are English and auto-generated, so they only pick the type. */
const WHOOP_SPORT_TYPES: Record<string, ActivityType> = {
  cycling: 'ride',
  'mountain biking': 'ride',
  'indoor cycling': 'indoor_ride',
  spinning: 'indoor_ride',
  spin: 'indoor_ride',
  running: 'run',
  'trail running': 'run',
  treadmill: 'run',
  jogging: 'run',
  hiking: 'hike',
  'hiking/rucking': 'hike',
  rucking: 'hike',
  weightlifting: 'strength',
  'functional fitness': 'strength',
  'strength trainer': 'strength',
}

export function whoopSportToActivityType(sportName: string | null | undefined): ActivityType {
  const key = trimmedOrNull(sportName)?.toLowerCase()
  if (key === undefined) return 'other'
  return WHOOP_SPORT_TYPES[key] ?? 'other'
}

function whoopZoneSeconds(zones: WhoopZoneDurations | null | undefined): ZoneSeconds | null {
  if (!zones) return null
  // zone_zero is everything below zone 1 and has no slot in the internal model.
  return [
    milliToSeconds(zones.zone_one_milli),
    milliToSeconds(zones.zone_two_milli),
    milliToSeconds(zones.zone_three_milli),
    milliToSeconds(zones.zone_four_milli),
    milliToSeconds(zones.zone_five_milli),
  ]
}

function recordKey(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const key = String(value).trim()
  return key === '' ? null : key
}

export function whoopWorkoutToActivity(
  record: WhoopWorkoutRecord,
  ctx: MappingContext,
): Activity | null {
  const recordId = recordKey(record.id)
  const startedAt = toIsoOrNull(record.start)
  if (recordId === null || startedAt === null) return null

  const endedAt = toIsoOrNull(record.end)
  const durationSec = secondsBetween(startedAt, endedAt)
  if (durationSec === null) return null

  const score = record.score ?? null
  const type = whoopSportToActivityType(record.sport_name)
  const strain = toNumber(score?.strain)

  return {
    id: domainId('whoop', 'workout', recordId),
    userId: ctx.userId,
    source: sourceRef('whoop', recordId, ctx),
    type,
    name: ACTIVITY_TYPE_LABELS[type],
    startedAt,
    timezone: trimmedOrNull(record.timezone_offset),
    // WHOOP reports one span only; active and elapsed time are the same value.
    durationSec,
    elapsedSec: durationSec,
    distanceM: positiveOrNull(score?.distance_meter),
    elevationGainM: toNumber(score?.altitude_gain_meter),
    avgSpeedMps: null,
    avgHeartRate: positiveOrNull(score?.average_heart_rate),
    maxHeartRate: positiveOrNull(score?.max_heart_rate),
    // A strap has no power meter.
    avgPower: null,
    normalizedPower: null,
    calories: kilojouleToCalories(score?.kilojoule),
    trainingLoad: strain,
    trainingLoadKind: strain === null ? null : 'whoop_strain',
    hrZoneSec: whoopZoneSeconds(score?.zone_durations),
    powerZoneSec: null,
    hasGps: false,
  }
}

export function whoopRecoveryToDaily(
  record: WhoopRecoveryRecord,
  ctx: MappingContext,
): DailyHealthMetrics | null {
  const recordId = recordKey(record.cycle_id)
  const createdAt = toIsoOrNull(record.created_at)
  if (recordId === null || createdAt === null) return null

  const score = record.score ?? null
  return {
    date: toDayKey(new Date(createdAt)),
    userId: ctx.userId,
    source: sourceRef('whoop', recordId, ctx),
    hrvMs: round(positiveOrNull(score?.hrv_rmssd_milli), 1),
    restingHeartRate: positiveOrNull(score?.resting_heart_rate),
    // Only the sleep record carries it; withRespiratoryRateFromSleep fills it in.
    respiratoryRate: null,
    skinTemperatureC: round(toNumber(score?.skin_temp_celsius), 1),
    bloodOxygenPct: round(positiveOrNull(score?.spo2_percentage), 1),
    // Would need the body measurement endpoint, which this adapter does not read.
    weightKg: null,
  }
}

export function whoopSleepToSession(
  record: WhoopSleepRecord,
  ctx: MappingContext,
): SleepSession | null {
  const recordId = recordKey(record.id)
  const startedAt = toIsoOrNull(record.start)
  const endedAt = toIsoOrNull(record.end)
  if (recordId === null || startedAt === null || endedAt === null) return null
  // Naps would inflate "Schlafdauer" for the day; the night is the session.
  if (record.nap === true) return null

  const stages = record.score?.stage_summary ?? null
  // Without the stage summary there is no honest asleep time, so the record waits
  // for WHOOP to finish scoring instead of being stored with a substitute.
  if (!stages) return null

  const timeInBedSec = milliToSeconds(stages.total_in_bed_time_milli)
  const awakeSec = milliToSeconds(stages.total_awake_time_milli)
  const durationSec = timeInBedSec - awakeSec
  if (durationSec <= 0) return null

  return {
    id: domainId('whoop', 'sleep', recordId),
    userId: ctx.userId,
    source: sourceRef('whoop', recordId, ctx),
    // A night belongs to the morning it ends on.
    date: toDayKey(new Date(endedAt)),
    startedAt,
    endedAt,
    durationSec,
    timeInBedSec,
    sleepScore: round(positiveOrNull(record.score?.sleep_performance_percentage), 0),
    stages: {
      remSec: milliToSeconds(stages.total_rem_sleep_time_milli),
      deepSec: milliToSeconds(stages.total_slow_wave_sleep_time_milli),
      lightSec: milliToSeconds(stages.total_light_sleep_time_milli),
      awakeSec,
    },
    respiratoryRate: round(positiveOrNull(record.score?.respiratory_rate), 1),
  }
}

/**
 * Recovery score and day strain live in two different WHOOP resources: the
 * score comes from /v2/recovery, the strain from the matching /v2/cycle row.
 * Pass `null` for the cycle when it was not part of the page — dayStrain then
 * stays null instead of becoming 0.
 */
export function whoopRecoveryToRecoveryMetric(
  record: WhoopRecoveryRecord,
  cycle: WhoopCycleRecord | null,
  ctx: MappingContext,
): RecoveryMetric | null {
  const recordId = recordKey(record.cycle_id)
  const createdAt = toIsoOrNull(record.created_at)
  if (recordId === null || createdAt === null) return null

  const score = record.score ?? null
  return {
    id: domainId('whoop', 'recovery', recordId),
    userId: ctx.userId,
    source: sourceRef('whoop', recordId, ctx),
    date: toDayKey(new Date(createdAt)),
    providerScore: round(positiveOrNull(score?.recovery_score), 0),
    dayStrain: round(toNumber(cycle?.score?.strain), 1),
    hrvMs: round(positiveOrNull(score?.hrv_rmssd_milli), 1),
    restingHeartRate: positiveOrNull(score?.resting_heart_rate),
  }
}

/**
 * The respiratory rate is measured during sleep, so it reaches the daily row
 * from the sleep session of the same date. Nothing is computed here — the value
 * is copied, and days without a scored night keep `null`.
 */
export function withRespiratoryRateFromSleep(
  daily: readonly DailyHealthMetrics[],
  sleep: readonly SleepSession[],
): DailyHealthMetrics[] {
  const byDate = new Map<string, number>()
  for (const session of sleep) {
    if (session.respiratoryRate !== null) byDate.set(session.date, session.respiratoryRate)
  }
  return daily.map((day) => {
    if (day.respiratoryRate !== null) return day
    const rate = byDate.get(day.date)
    return rate === undefined ? day : { ...day, respiratoryRate: rate }
  })
}

/* ------------------------------------------------------------------ Wahoo */

export interface WahooWorkoutSummary {
  id?: string | number | null
  ascent_accum?: NumericLike
  cadence_avg?: NumericLike
  calories_accum?: NumericLike
  distance_accum?: NumericLike
  duration_active_accum?: NumericLike
  duration_paused_accum?: NumericLike
  duration_total_accum?: NumericLike
  heart_rate_avg?: NumericLike
  power_avg?: NumericLike
  speed_avg?: NumericLike
  work_accum?: NumericLike
}

export interface WahooWorkoutRecord {
  id?: string | number | null
  name?: string | null
  /** ISO timestamp of the start. */
  starts?: string | null
  minutes?: NumericLike
  workout_type_id?: number | string | null
  workout_summary?: WahooWorkoutSummary | null
}

/**
 * Endpoint-verified: 0 outdoor cycling, 1 running, 5 treadmill, 12 indoor
 * cycling, 25 lap swim. The remaining ids come from the previous integration
 * and are best effort — an unknown id falls back to "Sonstiges".
 */
const WAHOO_WORKOUT_TYPES: Record<number, ActivityType> = {
  0: 'ride',
  1: 'run',
  2: 'hike',
  3: 'other',
  4: 'ride',
  5: 'run',
  6: 'other',
  12: 'indoor_ride',
  13: 'other',
  22: 'other',
  25: 'other',
  61: 'strength',
}

export function wahooWorkoutTypeToActivityType(typeId: number | string | null | undefined): ActivityType {
  const parsed = toNumber(typeId)
  if (parsed === null) return 'other'
  return WAHOO_WORKOUT_TYPES[parsed] ?? 'other'
}

export function wahooWorkoutToActivity(
  record: WahooWorkoutRecord,
  ctx: MappingContext,
): Activity | null {
  const recordId = recordKey(record.id)
  const startedAt = toIsoOrNull(record.starts)
  if (recordId === null || startedAt === null) return null

  const summary = record.workout_summary ?? null
  const activeSec = positiveOrNull(summary?.duration_active_accum)
  const totalSec = positiveOrNull(summary?.duration_total_accum)
  const plannedSec = positiveOrNull(record.minutes)
  const durationSec = activeSec ?? totalSec ?? (plannedSec === null ? null : plannedSec * 60)
  if (durationSec === null) return null

  const type = wahooWorkoutTypeToActivityType(record.workout_type_id)
  return {
    id: domainId('wahoo', 'workout', recordId),
    userId: ctx.userId,
    source: sourceRef('wahoo', recordId, ctx),
    type,
    // A name the athlete typed is data; the German label only fills a gap.
    name: trimmedOrNull(record.name) ?? ACTIVITY_TYPE_LABELS[type],
    startedAt,
    timezone: null,
    durationSec: Math.round(durationSec),
    elapsedSec: totalSec === null ? null : Math.round(totalSec),
    distanceM: positiveOrNull(summary?.distance_accum),
    elevationGainM: toNumber(summary?.ascent_accum),
    avgSpeedMps: positiveOrNull(summary?.speed_avg),
    avgHeartRate: positiveOrNull(summary?.heart_rate_avg),
    // The Wahoo summary has no maximum heart rate.
    maxHeartRate: null,
    avgPower: positiveOrNull(summary?.power_avg),
    normalizedPower: null,
    calories: positiveOrNull(summary?.calories_accum),
    trainingLoad: null,
    trainingLoadKind: null,
    // Wahoo returns no zone durations at all; they come from WHOOP.
    hrZoneSec: null,
    powerZoneSec: null,
    // A track exists inside the FIT file, which this adapter does not download.
    hasGps: false,
  }
}

/* ------------------------------------------------------------------ Merge */

/** Two records describe one session when start and duration are this close. */
export const START_MATCH_TOLERANCE_MS = 20 * 60 * 1000
export const DURATION_MATCH_TOLERANCE_SEC = 15 * 60

/** Head of the list wins when two providers disagree about the same session. */
export const DEFAULT_PROVIDER_PRIORITY: readonly ProviderId[] = [
  'wahoo',
  'whoop',
  'garmin',
  'strava',
  'apple_health',
  'wub',
  'csv',
  'manual',
  'mock',
]

/** Measured by the bike computer: distance, speed, power, climbing. */
const DEVICE_PREFERRED: readonly ProviderId[] = ['wahoo', 'garmin', 'strava']
/** Derived from continuous heart rate: zones, load, maxima. */
const STRAP_PREFERRED: readonly ProviderId[] = ['whoop', 'garmin']

function orderedProviders(
  preferred: readonly ProviderId[],
  fallback: readonly ProviderId[],
): ProviderId[] {
  const seen = new Set<ProviderId>()
  const order: ProviderId[] = []
  for (const id of [...preferred, ...fallback]) {
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  return order
}

function isSameSession(a: Activity, b: Activity): boolean {
  const startGap = Math.abs(Date.parse(a.startedAt) - Date.parse(b.startedAt))
  if (!Number.isFinite(startGap)) return false
  return startGap <= START_MATCH_TOLERANCE_MS
    && Math.abs(a.durationSec - b.durationSec) <= DURATION_MATCH_TOLERANCE_SEC
}

/** First non-null value walking the providers in the given order. */
function pick<T>(
  members: readonly Activity[],
  order: readonly ProviderId[],
  select: (activity: Activity) => T | null,
): T | null {
  for (const provider of order) {
    for (const member of members) {
      if (member.source.provider !== provider) continue
      const value = select(member)
      if (value !== null) return value
    }
  }
  for (const member of members) {
    const value = select(member)
    if (value !== null) return value
  }
  return null
}

function combine(members: readonly Activity[], priority: readonly ProviderId[]): Activity | null {
  const ranked = [...members].sort((a, b) => {
    const rankA = priority.indexOf(a.source.provider)
    const rankB = priority.indexOf(b.source.provider)
    return (rankA < 0 ? priority.length : rankA) - (rankB < 0 ? priority.length : rankB)
  })
  const primary = ranked[0]
  if (primary === undefined) return null
  if (ranked.length === 1) return primary

  const deviceOrder = orderedProviders(DEVICE_PREFERRED, priority)
  const strapOrder = orderedProviders(STRAP_PREFERRED, priority)
  // Load and its unit have to travel together, so they are picked as one value.
  const load = pick(ranked, strapOrder, (activity) =>
    activity.trainingLoad === null
      ? null
      : { value: activity.trainingLoad, kind: activity.trainingLoadKind },
  )

  return {
    // Identity, provenance and naming stay with the leading provider.
    ...primary,
    // The recording zone is a fact about the session, so any member may supply it.
    timezone: pick(ranked, priority, (activity) => activity.timezone),
    durationSec: Math.max(...ranked.map((activity) => activity.durationSec)),
    elapsedSec: pick(ranked, deviceOrder, (activity) => activity.elapsedSec),
    distanceM: pick(ranked, deviceOrder, (activity) => activity.distanceM),
    elevationGainM: pick(ranked, deviceOrder, (activity) => activity.elevationGainM),
    avgSpeedMps: pick(ranked, deviceOrder, (activity) => activity.avgSpeedMps),
    avgHeartRate: pick(ranked, strapOrder, (activity) => activity.avgHeartRate),
    maxHeartRate: pick(ranked, strapOrder, (activity) => activity.maxHeartRate),
    avgPower: pick(ranked, deviceOrder, (activity) => activity.avgPower),
    normalizedPower: pick(ranked, deviceOrder, (activity) => activity.normalizedPower),
    calories: pick(ranked, deviceOrder, (activity) => activity.calories),
    trainingLoad: load === null ? null : load.value,
    trainingLoadKind: load === null ? null : load.kind,
    hrZoneSec: pick(ranked, strapOrder, (activity) => activity.hrZoneSec),
    powerZoneSec: pick(ranked, deviceOrder, (activity) => activity.powerZoneSec),
    hasGps: ranked.some((activity) => activity.hasGps),
  }
}

/**
 * De-duplicates the same session imported from several providers: one ride
 * recorded by the bike computer and by the strap becomes one activity that
 * keeps the Wahoo distance and power together with the WHOOP zones and strain.
 *
 * Records from the same provider are never merged with each other — only an
 * exact repeat of provider plus record id counts as the same import, and the
 * newer sync of it wins.
 */
export function mergeActivities(
  activities: readonly Activity[],
  byProviderPriority: readonly ProviderId[] = DEFAULT_PROVIDER_PRIORITY,
): Activity[] {
  const unique = new Map<string, Activity>()
  for (const activity of activities) {
    const key = `${activity.source.provider}:${activity.source.recordId}`
    const existing = unique.get(key)
    if (existing === undefined || existing.source.syncedAt <= activity.source.syncedAt) {
      unique.set(key, activity)
    }
  }

  const chronological = [...unique.values()].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  )

  const clusters: Activity[][] = []
  for (const activity of chronological) {
    const cluster = clusters.find(
      (candidate) =>
        candidate.every((member) => member.source.provider !== activity.source.provider)
        && candidate.some((member) => isSameSession(member, activity)),
    )
    if (cluster === undefined) clusters.push([activity])
    else cluster.push(activity)
  }

  const merged: Activity[] = []
  for (const cluster of clusters) {
    const activity = combine(cluster, byProviderPriority)
    if (activity !== null) merged.push(activity)
  }
  // Newest first, the order every list in the app shows.
  return merged.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}
