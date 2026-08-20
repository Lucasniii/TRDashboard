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
import { userConnectionStates } from '@/lib/store/user-tokens'

/** The local calendar day of an activity is encoded in its ISO start time. */
function activityDayKey(activity: Activity): string {
  return activity.startedAt.slice(0, 10)
}

/**
 * Production's small single-user repository. The file-store owns durability
 * and permissions; this layer only turns its collections into page queries.
 */
export class LocalRepository implements HealthDataRepository {
  constructor(private readonly userId: string) {}

  async getSettings(): Promise<UserSettings> {
    return await readSettings(this.userId)
  }

  async saveSettings(settings: UserSettings): Promise<UserSettings> {
    return await writeSettings(this.userId, settings)
  }

  async getActivities(range: DateRange): Promise<Activity[]> {
    return (await readActivities(this.userId)).filter((activity) => rangeContains(range, activityDayKey(activity)))
  }

  async getActivityById(id: string): Promise<ActivityDetail | null> {
    const activity = (await readActivities(this.userId)).find((candidate) => candidate.id === id)
    return activity === undefined ? null : { activity, streams: null }
  }

  async getDailyHealth(range: DateRange): Promise<DailyHealthMetrics[]> {
    return (await readDailyHealth(this.userId)).filter((entry) => rangeContains(range, entry.date))
  }

  async getSleepSessions(range: DateRange): Promise<SleepSession[]> {
    return (await readSleep(this.userId)).filter((entry) => rangeContains(range, entry.date))
  }

  async getRecoveryMetrics(range: DateRange): Promise<RecoveryMetric[]> {
    return (await readRecovery(this.userId)).filter((entry) => rangeContains(range, entry.date))
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    return describeAllDataSources(await userConnectionStates(this.userId))
  }

  async getEarliestRecordDate(): Promise<string | null> {
    const candidates = [
      ...(await readActivities(this.userId)).map(activityDayKey),
      ...(await readDailyHealth(this.userId)).map((entry) => entry.date),
      ...(await readSleep(this.userId)).map((entry) => entry.date),
      ...(await readRecovery(this.userId)).map((entry) => entry.date),
    ]
    return candidates.length === 0
      ? null
      : candidates.reduce((earliest, value) => (value < earliest ? value : earliest))
  }
}
