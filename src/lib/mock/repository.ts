/**
 * The mock implementation of the one interface the app reads through. It holds
 * a single generated dataset in memory and answers every query by filtering it,
 * which is exactly what the Postgres implementation will do with SQL later.
 */

import type { HealthDataRepository } from '@/lib/data/repository'
import { rangeContains } from '@/lib/date'
import type {
  Activity,
  ActivityDetail,
  DailyHealthMetrics,
  DataSourceStatus,
  DateRange,
  RecoveryMetric,
  SleepSession,
  UserSettings,
} from '@/lib/domain/types'
import { generateMockDataset, type MockDataset } from '@/lib/mock/generator'
import { describeAllDataSources } from '@/lib/providers/registry'

/**
 * Lazy singleton: the dataset is built on first access and then reused for the
 * lifetime of the process, so repeated requests see a stable history.
 */
let cachedDataset: MockDataset | null = null

function dataset(): MockDataset {
  if (cachedDataset === null) cachedDataset = generateMockDataset(new Date())
  return cachedDataset
}

/**
 * The day an activity belongs to is the local day it was started in, which is
 * the date part of its own timestamp — not a re-derivation in whatever
 * timezone the server runs in.
 */
function activityDayKey(activity: Activity): string {
  return activity.startedAt.slice(0, 10)
}

/**
 * The demo source is the only one this repository speaks for. Every real
 * platform's capabilities come from the provider registry, so the settings page
 * can never claim a platform delivers something its adapter does not.
 */
const DEMO_SOURCE: DataSourceStatus = {
  provider: 'mock',
  label: 'Demodaten',
  connected: true,
  configured: true,
  lastSyncAt: null,
  capabilities: {
    activities: true,
    activityStreams: true,
    gps: true,
    hrZones: true,
    powerZones: true,
    hrv: true,
    restingHeartRate: true,
    sleep: true,
    recoveryScore: true,
    weight: true,
  },
}

export class MockRepository implements HealthDataRepository {
  async getSettings(): Promise<UserSettings> {
    return dataset().settings
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    const store = dataset()
    store.settings = settings
    return store.settings
  }

  async getActivities(range: DateRange): Promise<Activity[]> {
    return dataset().activities.filter((activity) =>
      rangeContains(range, activityDayKey(activity)),
    )
  }

  async getActivityById(id: string): Promise<ActivityDetail | null> {
    const store = dataset()
    const activity = store.activities.find((candidate) => candidate.id === id)
    if (!activity) return null
    return { activity, streams: store.streams[id] ?? null }
  }

  async getDailyHealth(range: DateRange): Promise<DailyHealthMetrics[]> {
    return dataset().dailyHealth.filter((entry) => rangeContains(range, entry.date))
  }

  async getSleepSessions(range: DateRange): Promise<SleepSession[]> {
    return dataset().sleep.filter((entry) => rangeContains(range, entry.date))
  }

  async getRecoveryMetrics(range: DateRange): Promise<RecoveryMetric[]> {
    return dataset().recovery.filter((entry) => rangeContains(range, entry.date))
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    // Demo data first, then every real platform as the registry describes it.
    return [{ ...DEMO_SOURCE }, ...describeAllDataSources()]
  }

  async getEarliestRecordDate(): Promise<string | null> {
    const store = dataset()
    const candidates: string[] = []
    const firstActivity = store.activities[0]
    if (firstActivity) candidates.push(activityDayKey(firstActivity))
    const firstHealth = store.dailyHealth[0]
    if (firstHealth) candidates.push(firstHealth.date)
    const firstSleep = store.sleep[0]
    if (firstSleep) candidates.push(firstSleep.date)
    const firstRecovery = store.recovery[0]
    if (firstRecovery) candidates.push(firstRecovery.date)
    if (candidates.length === 0) return null
    return candidates.reduce((earliest, value) => (value < earliest ? value : earliest))
  }
}
