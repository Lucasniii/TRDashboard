/**
 * Internal data model. Every provider is normalized into these shapes, so the
 * UI and the analytics layer never learn which platform a record came from.
 *
 * Rule throughout: a metric that a provider does not supply is `null`, never 0
 * and never a substitute value. The UI renders "keine Daten" for null.
 */

export type ProviderId =
  | 'whoop'
  | 'wahoo'
  | 'strava'
  | 'garmin'
  | 'apple_health'
  | 'wub'
  | 'csv'
  | 'manual'
  | 'mock'

export type ActivityType =
  | 'ride'
  | 'indoor_ride'
  | 'run'
  | 'hike'
  | 'strength'
  | 'other'

/** Provenance kept on every imported record, per the "retain the source" rule. */
export interface SourceRef {
  provider: ProviderId
  recordId: string
  syncedAt: string
}

/** Zone 1..5 durations in seconds, index 0 = zone 1. */
export type ZoneSeconds = readonly [number, number, number, number, number]

export type ZoneKind = 'heart_rate' | 'power'

export interface Activity {
  id: string
  userId: string
  source: SourceRef
  type: ActivityType
  name: string
  /** ISO 8601 with the offset the activity was recorded in. */
  startedAt: string
  timezone: string | null
  /** Active/moving time. */
  durationSec: number
  elapsedSec: number | null
  distanceM: number | null
  elevationGainM: number | null
  avgSpeedMps: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  avgPower: number | null
  normalizedPower: number | null
  calories: number | null
  /** Provider-supplied load (Whoop strain, TSS, …). Never computed silently. */
  trainingLoad: number | null
  trainingLoadKind: 'whoop_strain' | 'tss' | 'trimp' | null
  hrZoneSec: ZoneSeconds | null
  powerZoneSec: ZoneSeconds | null
  hasGps: boolean
}

/** Per-second sample series for the activity detail charts. */
export interface ActivityStreams {
  activityId: string
  /** Offset in seconds from activity start; the shared x-axis of all streams. */
  timeSec: number[]
  heartRate: number[] | null
  power: number[] | null
  speedMps: number[] | null
  altitudeM: number[] | null
  cadence: number[] | null
  latLng: Array<[number, number]> | null
}

export interface ActivityDetail {
  activity: Activity
  streams: ActivityStreams | null
}

/** One row per calendar day. Any field may be null. */
export interface DailyHealthMetrics {
  /** YYYY-MM-DD in the user's local timezone. */
  date: string
  userId: string
  source: SourceRef
  hrvMs: number | null
  restingHeartRate: number | null
  respiratoryRate: number | null
  skinTemperatureC: number | null
  bloodOxygenPct: number | null
  weightKg: number | null
}

export interface SleepStages {
  remSec: number
  deepSec: number
  lightSec: number
  awakeSec: number
}

export interface SleepSession {
  id: string
  userId: string
  source: SourceRef
  /** The morning the sleep belongs to, YYYY-MM-DD. */
  date: string
  startedAt: string
  endedAt: string
  /** Time actually asleep. */
  durationSec: number
  timeInBedSec: number | null
  /** Provider sleep score 0..100. */
  sleepScore: number | null
  stages: SleepStages | null
  respiratoryRate: number | null
}

export interface RecoveryMetric {
  id: string
  userId: string
  source: SourceRef
  date: string
  /** Score exactly as the provider reported it, 0..100. */
  providerScore: number | null
  /** Day strain / load as reported by the provider. */
  dayStrain: number | null
  hrvMs: number | null
  restingHeartRate: number | null
}

export interface ZoneBoundary {
  zone: 1 | 2 | 3 | 4 | 5
  /** German display name, e.g. "Grundlagenausdauer 1". */
  label: string
  /** bpm for heart rate, watts for power. Upper bound null on zone 5. */
  min: number
  max: number | null
}

export interface TrainingZoneSet {
  kind: ZoneKind
  boundaries: ZoneBoundary[]
  /** Basis the boundaries were derived from. */
  maxHeartRate?: number
  ftpWatts?: number
}

export interface WeeklyGoals {
  durationSec: number | null
  distanceM: number | null
  elevationGainM: number | null
}

export interface UserSettings {
  userId: string
  displayName: string
  locale: 'de-AT'
  weeklyGoals: WeeklyGoals
  heartRateZones: TrainingZoneSet
  powerZones: TrainingZoneSet
}

/** What a provider can actually deliver — drives graceful degradation in the UI. */
export interface ProviderCapabilities {
  activities: boolean
  activityStreams: boolean
  gps: boolean
  hrZones: boolean
  powerZones: boolean
  hrv: boolean
  restingHeartRate: boolean
  sleep: boolean
  recoveryScore: boolean
  weight: boolean
}

export interface DataSourceStatus {
  provider: ProviderId
  label: string
  connected: boolean
  configured: boolean
  lastSyncAt: string | null
  capabilities: ProviderCapabilities
}

export type SyncJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface SyncJob {
  id: string
  provider: ProviderId
  status: SyncJobStatus
  startedAt: string
  finishedAt: string | null
  recordCounts: Partial<Record<'activities' | 'health' | 'sleep' | 'recovery', number>>
  error: string | null
}

/** Half-open range [from, to). Both YYYY-MM-DD, local time. */
export interface DateRange {
  from: string
  to: string
}
