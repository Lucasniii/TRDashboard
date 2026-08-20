// server-only: reads and writes private Supabase JSON documents and must never
// be imported from a client component.

import { buildHeartRateZones, buildPowerZones } from '@/components/settings/zone-math'
import type {
  Activity,
  DailyHealthMetrics,
  ProviderId,
  RecoveryMetric,
  SleepSession,
  SourceRef,
  SyncJob,
  UserSettings,
} from '@/lib/domain/types'
import { readUserDocument, writeUserDocument } from './user-document-store'

/**
 * One JSON document per collection. Records are upserted rather than appended,
 * so re-syncing an overlapping date range updates rows instead of duplicating
 * them:
 *   - activities and sleep are identified by the provider plus the provider's
 *     own record id;
 *   - daily health and recovery are one row per day per provider, so the same
 *     day imported from WHOOP and from Wahoo stays two rows and the merge
 *     happens further up.
 * When a row already exists, the one with the newer `source.syncedAt` wins —
 * an older re-import (a replayed page, a backfill) never overwrites fresher
 * data.
 */

const ACTIVITIES_DOCUMENT = 'activities'
const DAILY_HEALTH_DOCUMENT = 'daily-health'
const SLEEP_DOCUMENT = 'sleep'
const RECOVERY_DOCUMENT = 'recovery'
const SETTINGS_DOCUMENT = 'settings'
const SYNC_JOBS_DOCUMENT = 'sync-jobs'

/** A sync history longer than this is noise; the settings view shows far less. */
const MAX_SYNC_JOBS = 50

const DEFAULT_MAX_HEART_RATE = 188
const DEFAULT_FTP_WATTS = 300

/** Used until an individual user saves the Einstellungen form for the first time. */
function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    displayName: 'Lucas',
    locale: 'de-AT',
    weeklyGoals: {
      durationSec: 15 * 3600,
      distanceM: 400000,
      elevationGainM: 4000,
    },
    heartRateZones: buildHeartRateZones(DEFAULT_MAX_HEART_RATE),
    powerZones: buildPowerZones(DEFAULT_FTP_WATTS),
  }
}

interface Sourced {
  source: SourceRef
}

interface Dated extends Sourced {
  date: string
}

function hasValidSource(value: unknown): value is Sourced {
  if (typeof value !== 'object' || value === null) return false
  const source = (value as Partial<Sourced>).source
  if (typeof source !== 'object' || source === null) return false
  const candidate = source as Partial<SourceRef>
  return (
    typeof candidate.provider === 'string' &&
    typeof candidate.recordId === 'string' &&
    typeof candidate.syncedAt === 'string'
  )
}

function hasValidDate(value: unknown): value is Dated {
  return hasValidSource(value) && typeof (value as Partial<Dated>).date === 'string'
}

/** Identity of an activity or a sleep session. */
function sourceKey(row: Sourced): string {
  return `${row.source.provider}:${row.source.recordId}`
}

/** Identity of a daily health or recovery row. */
function dateKey(row: Dated): string {
  return `${row.date}:${row.source.provider}`
}

async function readCollection<T>(
  userId: string,
  document: string,
  isValid: (value: unknown) => value is T,
): Promise<T[]> {
  const stored = await readUserDocument<unknown[]>(userId, document, [])
  if (!Array.isArray(stored)) return []
  return stored.filter(isValid)
}

/**
 * Read, merge and write in one call — there is no locking, so splitting this
 * across the caller would lose rows.
 */
async function upsertCollection<T extends Sourced>(
  userId: string,
  document: string,
  isValid: (value: unknown) => value is T,
  keyOf: (row: T) => string,
  incoming: readonly T[],
): Promise<number> {
  if (incoming.length === 0) return 0
  const byKey = new Map<string, T>()
  for (const row of await readCollection(userId, document, isValid)) {
    byKey.set(keyOf(row), row)
  }
  let written = 0
  for (const row of incoming) {
    const key = keyOf(row)
    const current = byKey.get(key)
    // Strictly older imports are dropped; an equal timestamp is a re-import of
    // the same sync and may overwrite.
    if (current !== undefined && current.source.syncedAt > row.source.syncedAt) continue
    byKey.set(key, row)
    written += 1
  }
  await writeUserDocument(userId, document, [...byKey.values()])
  return written
}

function isActivity(value: unknown): value is Activity {
  return hasValidSource(value)
}

function isDailyHealth(value: unknown): value is DailyHealthMetrics {
  return hasValidDate(value)
}

function isSleep(value: unknown): value is SleepSession {
  return hasValidSource(value)
}

function isRecovery(value: unknown): value is RecoveryMetric {
  return hasValidDate(value)
}

export async function readActivities(userId: string): Promise<Activity[]> {
  return readCollection(userId, ACTIVITIES_DOCUMENT, isActivity)
}

export async function readDailyHealth(userId: string): Promise<DailyHealthMetrics[]> {
  return readCollection(userId, DAILY_HEALTH_DOCUMENT, isDailyHealth)
}

export async function readSleep(userId: string): Promise<SleepSession[]> {
  return readCollection(userId, SLEEP_DOCUMENT, isSleep)
}

export async function readRecovery(userId: string): Promise<RecoveryMetric[]> {
  return readCollection(userId, RECOVERY_DOCUMENT, isRecovery)
}

export async function upsertActivities(userId: string, rows: readonly Activity[]): Promise<number> {
  return upsertCollection(userId, ACTIVITIES_DOCUMENT, isActivity, sourceKey, rows)
}

export async function upsertDailyHealth(userId: string, rows: readonly DailyHealthMetrics[]): Promise<number> {
  return upsertCollection(userId, DAILY_HEALTH_DOCUMENT, isDailyHealth, dateKey, rows)
}

export async function upsertSleep(userId: string, rows: readonly SleepSession[]): Promise<number> {
  return upsertCollection(userId, SLEEP_DOCUMENT, isSleep, sourceKey, rows)
}

export async function upsertRecovery(userId: string, rows: readonly RecoveryMetric[]): Promise<number> {
  return upsertCollection(userId, RECOVERY_DOCUMENT, isRecovery, dateKey, rows)
}

/** Disconnecting a provider removes everything it ever delivered. */
export async function deleteByProvider(userId: string, provider: ProviderId): Promise<number> {
  let removed = 0
  const collections: Array<[string, (value: unknown) => value is Sourced]> = [
    [ACTIVITIES_DOCUMENT, hasValidSource],
    [DAILY_HEALTH_DOCUMENT, hasValidSource],
    [SLEEP_DOCUMENT, hasValidSource],
    [RECOVERY_DOCUMENT, hasValidSource],
  ]
  for (const entry of collections) {
    const [document, isValid] = entry
    const rows = await readCollection(userId, document, isValid)
    const kept = rows.filter((row) => row.source.provider !== provider)
    if (kept.length === rows.length) continue
    removed += rows.length - kept.length
    await writeUserDocument(userId, document, kept)
  }
  return removed
}

export async function readSettings(userId: string): Promise<UserSettings> {
  const defaults = defaultSettings(userId)
  const stored = await readUserDocument<UserSettings>(userId, SETTINGS_DOCUMENT, defaults)
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return structuredClone(defaults)
  }
  return { ...stored, userId }
}

export async function writeSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
  const privateSettings = { ...settings, userId }
  await writeUserDocument(userId, SETTINGS_DOCUMENT, privateSettings)
  return privateSettings
}

function isSyncJob(value: unknown): value is SyncJob {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<SyncJob>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.provider === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.startedAt === 'string'
  )
}

function sortJobs(jobs: SyncJob[]): SyncJob[] {
  return [...jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Newest first, capped at the 50 most recent runs. */
export async function readSyncJobs(userId: string): Promise<SyncJob[]> {
  return sortJobs(await readCollection(userId, SYNC_JOBS_DOCUMENT, isSyncJob)).slice(0, MAX_SYNC_JOBS)
}

/** Also updates a job in place, so a run can go pending -> running -> succeeded. */
export async function appendSyncJob(userId: string, job: SyncJob): Promise<void> {
  const existing = (await readCollection(userId, SYNC_JOBS_DOCUMENT, isSyncJob)).filter((row) => row.id !== job.id)
  const next = sortJobs([job, ...existing]).slice(0, MAX_SYNC_JOBS)
  await writeUserDocument(userId, SYNC_JOBS_DOCUMENT, next)
}

/** Drives the "noch keine Daten" empty state instead of an empty chart. */
export async function hasAnyRecords(userId: string): Promise<boolean> {
  return (
    (await readActivities(userId)).length > 0 ||
    (await readDailyHealth(userId)).length > 0 ||
    (await readSleep(userId)).length > 0 ||
    (await readRecovery(userId)).length > 0
  )
}
