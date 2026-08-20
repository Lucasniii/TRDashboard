// server-only: Wahoo's standard OAuth 2.0 flow and activity import.

import { fromDayKey } from '@/lib/date'
import type { Activity, DateRange, ProviderCapabilities, ProviderId } from '@/lib/domain/types'
import {
  DEFAULT_USER_ID,
  wahooWorkoutToActivity,
  type MappingContext,
  type WahooWorkoutRecord,
  type WahooWorkoutSummary,
} from './mapping'
import type { ProviderAdapter, ProviderFetchResult, ProviderTokens } from './types'

const API_URL = 'https://api.wahooligan.com'
const AUTHORIZE_URL = `${API_URL}/oauth/authorize`
const TOKEN_URL = `${API_URL}/oauth/token`
const SCOPES = ['user_read', 'workouts_read', 'offline_data'].join(' ')
const PAGE_SIZE = 30
const MAX_PAGES = 20
/**
 * Sandbox applications are allowed only 25 API requests per five minutes.
 * Leave a buffer for OAuth/profile calls and use the workout list even when
 * there is no budget left for its optional per-workout summary.
 */
const MAX_READ_REQUESTS_PER_SYNC = 20
const EXPIRY_SAFETY_SEC = 60

interface TokenResponse {
  access_token?: string | null
  refresh_token?: string | null
  expires_in?: number | string | null
  scope?: string | null
}

interface WorkoutPage {
  workouts?: WahooWorkoutRecord[] | null
}

export interface WahooIdentity {
  id: string
  displayName: string | null
  email: string | null
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.WAHOO_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.WAHOO_CLIENT_SECRET?.trim() ?? ''
  if (clientId === '' || clientSecret === '') {
    throw new Error('Wahoo ist noch nicht eingerichtet.')
  }
  return { clientId, clientSecret }
}

async function tokenRequest(parameters: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials()
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...parameters,
    }).toString(),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Wahoo-Tokenanfrage abgelehnt (${response.status}).`)
  return (await response.json()) as TokenResponse
}

function tokensFrom(response: TokenResponse, previous: ProviderTokens | null): ProviderTokens {
  const accessToken = response.access_token ?? ''
  if (accessToken === '') throw new Error('Wahoo hat kein Zugriffstoken zurückgegeben.')
  const expiresIn = Number(response.expires_in ?? 7200)
  return {
    accessToken,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + Math.max(Number.isFinite(expiresIn) ? expiresIn - EXPIRY_SAFETY_SEC : 3600, 0) * 1000,
    scope: response.scope ?? previous?.scope ?? null,
  }
}

async function get<T>(accessToken: string, path: string, parameters?: Record<string, string>): Promise<T> {
  const query = parameters === undefined ? '' : `?${new URLSearchParams(parameters).toString()}`
  const response = await fetch(`${API_URL}${path}${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    if (response.status === 429) {
      const resetSeconds = Number(response.headers.get('x-ratelimit-reset'))
      const waitMinutes = Number.isFinite(resetSeconds) && resetSeconds > 0
        ? Math.max(1, Math.ceil(resetSeconds / 60))
        : 5
      throw new Error(`Wahoo begrenzt aktuell die Anfragen. Bitte in etwa ${waitMinutes} Minuten erneut synchronisieren (429).`)
    }
    throw new Error(`Wahoo-Anfrage ${path} abgelehnt (${response.status}).`)
  }
  return (await response.json()) as T
}

function dayStartMs(day: string): number {
  const date = fromDayKey(day)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export class WahooAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'wahoo'
  readonly label = 'Wahoo'
  readonly capabilities: ProviderCapabilities = {
    activities: true,
    activityStreams: false,
    gps: false,
    hrZones: false,
    powerZones: false,
    hrv: false,
    restingHeartRate: false,
    sleep: false,
    recoveryScore: false,
    weight: false,
  }

  constructor(private readonly fallbackUserId: string = DEFAULT_USER_ID) {}

  isConfigured(): boolean {
    return (process.env.WAHOO_CLIENT_ID?.trim() ?? '') !== '' && (process.env.WAHOO_CLIENT_SECRET?.trim() ?? '') !== ''
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const { clientId } = credentials()
    return `${AUTHORIZE_URL}?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
    }).toString()}`
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    return tokensFrom(
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      null,
    )
  }

  async refresh(previous: ProviderTokens): Promise<ProviderTokens> {
    if (previous.refreshToken === null) throw new Error('Wahoo hat keinen Refresh-Token bereitgestellt.')
    return tokensFrom(
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: previous.refreshToken }),
      previous,
    )
  }

  /** The stable Wahoo member ID becomes the dashboard identity. */
  async getIdentity(tokens: ProviderTokens): Promise<WahooIdentity> {
    const profile = await get<Record<string, unknown>>(tokens.accessToken, '/v1/user')
    const id = profile.id
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id).trim() === '') {
      throw new Error('Wahoo hat keine Nutzerkennung zurückgegeben.')
    }
    const first = typeof profile.first === 'string' ? profile.first.trim() : ''
    const last = typeof profile.last === 'string' ? profile.last.trim() : ''
    return {
      id: String(id),
      displayName: [first, last].filter(Boolean).join(' ') || null,
      email: typeof profile.email === 'string' && profile.email.trim() !== '' ? profile.email.trim() : null,
    }
  }

  async fetch(tokens: ProviderTokens, range: DateRange, userId?: string): Promise<ProviderFetchResult> {
    const from = dayStartMs(range.from)
    const to = dayStartMs(range.to)
    const context: MappingContext = {
      userId: userId ?? this.fallbackUserId,
      syncedAt: new Date().toISOString(),
    }
    const activities: Activity[] = []
    let remainingRequests = MAX_READ_REQUESTS_PER_SYNC

    for (let page = 1; page <= MAX_PAGES && remainingRequests > 0; page += 1) {
      remainingRequests -= 1
      const response = await get<WorkoutPage>(tokens.accessToken, '/v1/workouts', {
        page: String(page),
        per_page: String(PAGE_SIZE),
      })
      const workouts = response.workouts ?? []
      if (workouts.length === 0) break

      let reachedHistory = false
      for (const workout of workouts) {
        const startedAt = Date.parse(workout.starts ?? '')
        if (!Number.isFinite(startedAt)) continue
        if (startedAt < from) {
          reachedHistory = true
          break
        }
        if (startedAt >= to) continue

        const summary =
          workout.workout_summary ??
          (remainingRequests <= 0 || workout.id === null || workout.id === undefined
            ? null
            : (remainingRequests -= 1, await this.getWorkoutSummary(tokens.accessToken, String(workout.id))))
        const activity = wahooWorkoutToActivity({ ...workout, workout_summary: summary }, context)
        if (activity !== null) activities.push(activity)
      }
      if (reachedHistory || remainingRequests <= 0) break
    }

    return { activities, dailyHealth: [], sleep: [], recovery: [] }
  }

  private async getWorkoutSummary(accessToken: string, workoutId: string): Promise<WahooWorkoutSummary | null> {
    try {
      return await get<WahooWorkoutSummary>(accessToken, `/v1/workouts/${workoutId}/workout_summary`)
    } catch {
      // A missing summary should omit only that optional detail, not the activity.
      return null
    }
  }
}

export const wahooAdapter = new WahooAdapter()
