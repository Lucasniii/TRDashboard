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

/**
 * The single read/write boundary used by all pages. Real providers are
 * normalized into the domain model before reaching this interface, so the UI
 * does not need to know whether a value came from WHOOP, Wahoo or local state.
 */
export interface HealthDataRepository {
  getSettings(): Promise<UserSettings>
  saveSettings(settings: UserSettings): Promise<UserSettings>
  getActivities(range: DateRange): Promise<Activity[]>
  getActivityById(id: string): Promise<ActivityDetail | null>
  getDailyHealth(range: DateRange): Promise<DailyHealthMetrics[]>
  getSleepSessions(range: DateRange): Promise<SleepSession[]>
  getRecoveryMetrics(range: DateRange): Promise<RecoveryMetric[]>
  getDataSources(): Promise<DataSourceStatus[]>
  getEarliestRecordDate(): Promise<string | null>
}
