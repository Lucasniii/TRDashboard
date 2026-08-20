import type {
  Activity,
  DailyHealthMetrics,
  DateRange,
  ProviderCapabilities,
  ProviderId,
  RecoveryMetric,
  SleepSession,
} from '@/lib/domain/types'

export interface ProviderTokens {
  accessToken: string
  refreshToken: string | null
  /** Epoch milliseconds. */
  expiresAt: number
  scope: string | null
}

export interface ProviderFetchResult {
  activities: Activity[]
  dailyHealth: DailyHealthMetrics[]
  sleep: SleepSession[]
  recovery: RecoveryMetric[]
}

/**
 * Every external platform implements this. The adapter owns the provider's
 * OAuth dialect and its response shapes; everything above it sees only the
 * internal model. A provider that cannot supply a domain (no sleep, no power)
 * returns an empty array and declares it in `capabilities`.
 */
export interface ProviderAdapter {
  readonly id: ProviderId
  readonly label: string
  readonly capabilities: ProviderCapabilities

  isConfigured(): boolean
  getAuthorizationUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>
  refresh(tokens: ProviderTokens): Promise<ProviderTokens>

  /** `userId` is written into normalized records; storage enforces the same boundary. */
  fetch(tokens: ProviderTokens, range: DateRange, userId?: string): Promise<ProviderFetchResult>
}
