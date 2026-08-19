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
import { describeAllDataSources } from '@/lib/providers/registry'
import {
  readActivities,
  readDailyHealth,
  readRecovery,
  readSettings,
  readSleep,
  writeSettings,
} from '@/lib/store/records'
import { connectionStates } from '@/lib/store/tokens'

/** The local calendar day of an activity is encoded in its ISO start time. */
function activityDayKey(activity: Activity): string {
  return activity.startedAt.slice(0, 10)
}

/**
 * Production's small single-user repository. The file-store owns durability
 * and permissions; this layer only turns its collections into page queries.
 */
export class LocalRepository implements HealthDataRepository {
  async getSettings(): Promise<UserSettings> {
    return readSettings()
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    return writeSettings(settings)
  }

  async getActivities(range: DateRange): Promise<Activity[]> {
    return readActivities().filter((activity) => rangeContains(range, activityDayKey(activity)))
  }

  async getActivityById(id: string): Promise<ActivityDetail | null> {
    const activity = readActivities().find((candidate) => candidate.id === id)
    return activity === undefined ? null : { activity, streams: null }
  }

  async getDailyHealth(range: DateRange): Promise<DailyHealthMetrics[]> {
    return readDailyHealth().filter((entry) => rangeContains(range, entry.date))
  }

  async getSleepSessions(range: DateRange): Promise<SleepSession[]> {
    return readSleep().filter((entry) => rangeContains(range, entry.date))
  }

  async getRecoveryMetrics(range: DateRange): Promise<RecoveryMetric[]> {
    return readRecovery().filter((entry) => rangeContains(range, entry.date))
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    return describeAllDataSources(connectionStates())
  }

  async getEarliestRecordDate(): Promise<string | null> {
    const candidates = [
      ...readActivities().map(activityDayKey),
      ...readDailyHealth().map((entry) => entry.date),
      ...readSleep().map((entry) => entry.date),
      ...readRecovery().map((entry) => entry.date),
    ]
    return candidates.length === 0
      ? null
      : candidates.reduce((earliest, value) => (value < earliest ? value : earliest))
  }
}
