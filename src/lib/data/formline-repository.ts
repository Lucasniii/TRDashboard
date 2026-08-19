// server-only: reads the existing, private Formline schema with the Supabase
// secret key. The key is never exposed to a client component.

import { buildHeartRateZones, buildPowerZones } from '@/components/settings/zone-math'
import type { HealthDataRepository } from '@/lib/data/repository'
import { rangeContains } from '@/lib/date'
import type {
  Activity,
  ActivityDetail,
  ActivityType,
  DailyHealthMetrics,
  DataSourceStatus,
  DateRange,
  ProviderId,
  RecoveryMetric,
  SleepSession,
  UserSettings,
  ZoneSeconds,
} from '@/lib/domain/types'
import { describeAllDataSources } from '@/lib/providers/registry'
import { readDocument, writeDocument } from '@/lib/store/document-store'

interface Config {
  url: string
  key: string
}

interface AthleteRow {
  id: string
  display_name: string
  locale: string
}

interface WeeklyGoalsRow {
  duration_minutes: number | string
  distance_km: number | string
  elevation_meters: number | string
}

interface ActivityRow {
  id: number | string
  athlete_id: string
  provider: string
  provider_record_id: string
  activity_type: string
  name: string
  started_at: string
  duration_seconds: number | string
  distance_meters: number | string | null
  elevation_meters: number | string | null
  average_heart_rate: number | string | null
  max_heart_rate: number | string | null
  average_power_watts: number | string | null
  normalized_power_watts: number | string | null
  calories: number | string | null
  average_speed_mps: number | string | null
  strain: number | string | null
  zone_durations: unknown
  updated_at: string
}

interface HealthRow {
  id: number | string
  athlete_id: string
  provider: string
  record_type: string
  provider_record_id: string
  measured_at: string
  calendar_date: string
  recovery_score: number | string | null
  hrv_rmssd_ms: number | string | null
  resting_heart_rate: number | string | null
  sleep_performance_percentage: number | string | null
  sleep_minutes: number | string | null
  deep_sleep_minutes: number | string | null
  rem_sleep_minutes: number | string | null
  light_sleep_minutes: number | string | null
  awake_minutes: number | string | null
  respiratory_rate: number | string | null
  spo2_percentage: number | string | null
  skin_temperature_celsius: number | string | null
  strain: number | string | null
  weight_kg: number | string | null
  updated_at: string
}

interface ConnectionRow {
  provider: string
  status: string
  last_synced_at: string | null
}

const SETTINGS_DOCUMENT = 'formline-settings'
const DEFAULT_MAX_HEART_RATE = 188
const DEFAULT_FTP_WATTS = 300

function config(): Config {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  if (url === '' || key === '') throw new Error('Die Formline-Datenquelle ist nicht eingerichtet.')
  return { url, key }
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0
}

function providerId(value: string): ProviderId {
  return value === 'whoop' || value === 'wahoo' ? value : 'manual'
}

function activityType(value: string): ActivityType {
  if (value === 'cycling') return 'ride'
  if (value === 'indoor_cycling') return 'indoor_ride'
  if (value === 'running') return 'run'
  if (value === 'hiking') return 'hike'
  if (value === 'strength') return 'strength'
  return 'other'
}

function zones(value: unknown): ZoneSeconds | null {
  if (!Array.isArray(value) || value.length !== 5) return null
  const parsed = value.map(numberOrNull)
  return parsed.every((entry) => entry !== null)
    ? [parsed[0]!, parsed[1]!, parsed[2]!, parsed[3]!, parsed[4]!]
    : null
}

function restUrl(table: string, params: Record<string, string>): string {
  const url = new URL(`/rest/v1/${table}`, config().url)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function readRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const { key } = config()
  const response = await fetch(restUrl(table, params), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Formline-Daten konnten nicht geladen werden.')
  return (await response.json()) as T[]
}

function mapActivity(row: ActivityRow): Activity {
  const provider = providerId(row.provider)
  return {
    id: `formline:activity:${String(row.id)}`,
    userId: row.athlete_id,
    source: { provider, recordId: row.provider_record_id, syncedAt: row.updated_at },
    type: activityType(row.activity_type),
    name: row.name,
    startedAt: row.started_at,
    timezone: null,
    durationSec: numberOrZero(row.duration_seconds),
    elapsedSec: numberOrZero(row.duration_seconds),
    distanceM: numberOrNull(row.distance_meters),
    elevationGainM: numberOrNull(row.elevation_meters),
    avgSpeedMps: numberOrNull(row.average_speed_mps),
    avgHeartRate: numberOrNull(row.average_heart_rate),
    maxHeartRate: numberOrNull(row.max_heart_rate),
    avgPower: numberOrNull(row.average_power_watts),
    normalizedPower: numberOrNull(row.normalized_power_watts),
    calories: numberOrNull(row.calories),
    trainingLoad: numberOrNull(row.strain),
    trainingLoadKind: provider === 'whoop' ? 'whoop_strain' : null,
    hrZoneSec: zones(row.zone_durations),
    powerZoneSec: null,
    hasGps: false,
  }
}

function healthSource(row: HealthRow) {
  return {
    provider: providerId(row.provider),
    recordId: row.provider_record_id,
    syncedAt: row.updated_at,
  }
}

function mapDailyHealth(row: HealthRow): DailyHealthMetrics {
  return {
    date: row.calendar_date,
    userId: row.athlete_id,
    source: healthSource(row),
    hrvMs: numberOrNull(row.hrv_rmssd_ms),
    restingHeartRate: numberOrNull(row.resting_heart_rate),
    respiratoryRate: numberOrNull(row.respiratory_rate),
    skinTemperatureC: numberOrNull(row.skin_temperature_celsius),
    bloodOxygenPct: numberOrNull(row.spo2_percentage),
    weightKg: numberOrNull(row.weight_kg),
  }
}

function mapSleep(row: HealthRow): SleepSession | null {
  const minutes = numberOrNull(row.sleep_minutes)
  if (minutes === null || minutes <= 0) return null
  const ended = new Date(row.measured_at)
  if (Number.isNaN(ended.getTime())) return null
  const started = new Date(ended.getTime() - minutes * 60_000)
  return {
    id: `formline:sleep:${String(row.id)}`,
    userId: row.athlete_id,
    source: healthSource(row),
    date: row.calendar_date,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    durationSec: Math.round(minutes * 60),
    timeInBedSec: null,
    sleepScore: numberOrNull(row.sleep_performance_percentage),
    stages: {
      remSec: Math.round(numberOrZero(row.rem_sleep_minutes) * 60),
      deepSec: Math.round(numberOrZero(row.deep_sleep_minutes) * 60),
      lightSec: Math.round(numberOrZero(row.light_sleep_minutes) * 60),
      awakeSec: Math.round(numberOrZero(row.awake_minutes) * 60),
    },
    respiratoryRate: numberOrNull(row.respiratory_rate),
  }
}

function mapRecovery(row: HealthRow): RecoveryMetric {
  return {
    id: `formline:recovery:${String(row.id)}`,
    userId: row.athlete_id,
    source: healthSource(row),
    date: row.calendar_date,
    providerScore: numberOrNull(row.recovery_score),
    dayStrain: numberOrNull(row.strain),
    hrvMs: numberOrNull(row.hrv_rmssd_ms),
    restingHeartRate: numberOrNull(row.resting_heart_rate),
  }
}

export class FormlineRepository implements HealthDataRepository {
  private async athlete(): Promise<AthleteRow | null> {
    return (await readRows<AthleteRow>('athletes', { select: 'id,display_name,locale', limit: '1' }))[0] ?? null
  }

  private async activities(): Promise<Activity[]> {
    const rows = await readRows<ActivityRow>('activities', {
      select: 'id,athlete_id,provider,provider_record_id,activity_type,name,started_at,duration_seconds,distance_meters,elevation_meters,average_heart_rate,max_heart_rate,average_power_watts,normalized_power_watts,calories,average_speed_mps,strain,zone_durations,updated_at',
      order: 'started_at.desc',
    })
    return rows.map(mapActivity)
  }

  private async health(): Promise<HealthRow[]> {
    return readRows<HealthRow>('health_metrics', {
      select: 'id,athlete_id,provider,record_type,provider_record_id,measured_at,calendar_date,recovery_score,hrv_rmssd_ms,resting_heart_rate,sleep_performance_percentage,sleep_minutes,deep_sleep_minutes,rem_sleep_minutes,light_sleep_minutes,awake_minutes,respiratory_rate,spo2_percentage,skin_temperature_celsius,strain,weight_kg,updated_at',
      order: 'calendar_date.desc',
    })
  }

  async getSettings(): Promise<UserSettings> {
    const [athlete, goals, saved] = await Promise.all([
      this.athlete(),
      readRows<WeeklyGoalsRow>('weekly_goals', { select: 'duration_minutes,distance_km,elevation_meters', limit: '1' }),
      readDocument<Partial<UserSettings>>(SETTINGS_DOCUMENT, {}),
    ])
    const goal = goals[0]
    const base: UserSettings = {
      userId: athlete?.id ?? 'formline',
      displayName: athlete?.display_name ?? 'Lucas',
      locale: 'de-AT',
      weeklyGoals: {
        durationSec: goal === undefined ? null : Math.round(numberOrZero(goal.duration_minutes) * 60),
        distanceM: goal === undefined ? null : Math.round(numberOrZero(goal.distance_km) * 1000),
        elevationGainM: goal === undefined ? null : Math.round(numberOrZero(goal.elevation_meters)),
      },
      heartRateZones: buildHeartRateZones(DEFAULT_MAX_HEART_RATE),
      powerZones: buildPowerZones(DEFAULT_FTP_WATTS),
    }
    return {
      ...base,
      ...saved,
      weeklyGoals: saved.weeklyGoals ?? base.weeklyGoals,
      heartRateZones: saved.heartRateZones ?? base.heartRateZones,
      powerZones: saved.powerZones ?? base.powerZones,
    }
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    await writeDocument(SETTINGS_DOCUMENT, settings)
    return settings
  }

  async getActivities(range: DateRange): Promise<Activity[]> {
    return (await this.activities()).filter((activity) => rangeContains(range, activity.startedAt.slice(0, 10)))
  }

  async getActivityById(id: string): Promise<ActivityDetail | null> {
    const activity = (await this.activities()).find((entry) => entry.id === id)
    return activity === undefined ? null : { activity, streams: null }
  }

  async getDailyHealth(range: DateRange): Promise<DailyHealthMetrics[]> {
    return (await this.health())
      .filter((row) => rangeContains(range, row.calendar_date))
      .map(mapDailyHealth)
  }

  async getSleepSessions(range: DateRange): Promise<SleepSession[]> {
    return (await this.health())
      .filter((row) => row.record_type === 'whoop_sleep' && rangeContains(range, row.calendar_date))
      .map(mapSleep)
      .filter((session): session is SleepSession => session !== null)
  }

  async getRecoveryMetrics(range: DateRange): Promise<RecoveryMetric[]> {
    return (await this.health())
      .filter((row) => row.record_type === 'whoop_recovery' && rangeContains(range, row.calendar_date))
      .map(mapRecovery)
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    const rows = await readRows<ConnectionRow>('provider_connections', {
      select: 'provider,status,last_synced_at',
    })
    const states: Partial<Record<ProviderId, { connected: boolean; lastSyncAt: string | null }>> = {}
    for (const row of rows) {
      const provider = providerId(row.provider)
      if (provider === 'manual') continue
      states[provider] = { connected: row.status === 'connected', lastSyncAt: row.last_synced_at }
    }
    return describeAllDataSources(states)
  }

  async getEarliestRecordDate(): Promise<string | null> {
    const records = await this.activities()
    return records.length === 0
      ? null
      : records.reduce((earliest, record) => (record.startedAt < earliest ? record.startedAt : earliest), records[0]!.startedAt).slice(0, 10)
  }
}
