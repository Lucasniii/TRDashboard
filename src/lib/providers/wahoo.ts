// server-only: reads credentials from process.env and must never be bundled
// into a client component.
import { fromDayKey } from '@/lib/date'
import type {
  Activity,
  DateRange,
  ProviderCapabilities,
  ProviderId,
} from '@/lib/domain/types'
import {
  DEFAULT_USER_ID,
  wahooWorkoutToActivity,
  type MappingContext,
  type WahooWorkoutRecord,
  type WahooWorkoutSummary,
} from './mapping'
import type { ProviderAdapter, ProviderFetchResult, ProviderTokens } from './types'

/**
 * Wahoo Cloud API v1. It supplies the ridden sessions with distance, climbing
 * and power. There are no health, sleep or recovery resources here, and no
 * heart rate zone durations either — those come from WHOOP.
 */

const WAHOO_AUTH_URL = 'https://api.wahooligan.com/oauth/authorize'
const WAHOO_TOKEN_URL = 'https://api.wahooligan.com/oauth/token'
const WAHOO_API_BASE = 'https://api.wahooligan.com'

const WAHOO_SCOPES = ['user_read', 'workouts_read', 'offline_data'].join(' ')

const PAGE_SIZE = 30
/** Bounds a first sync; 20 pages cover well over a year of riding. */
const MAX_PAGES = 20
/** Renew a minute early so a request cannot start on an expiring token. */
const EXPIRY_SAFETY_SEC = 60

interface WahooWorkoutPage {
  workouts?: WahooWorkoutRecord[] | null
}

interface WahooTokenResponse {
  access_token?: string | null
  refresh_token?: string | null
  expires_in?: number | string | null
  scope?: string | null
  token_type?: string | null
}

interface WahooCredentials {
  clientId: string
  clientSecret: string
}

function readCredentials(): WahooCredentials {
  const clientId = process.env.WAHOO_CLIENT_ID ?? ''
  const clientSecret = process.env.WAHOO_CLIENT_SECRET ?? ''
  if (clientId === '' || clientSecret === '') {
    throw new Error('Wahoo ist nicht eingerichtet: WAHOO_CLIENT_ID und WAHOO_CLIENT_SECRET fehlen.')
  }
  return { clientId, clientSecret }
}

/** Wahoo expects the credentials as form fields, not as a Basic header. */
async function postToken(body: Record<string, string>): Promise<WahooTokenResponse> {
  const { clientId, clientSecret } = readCredentials()
  const response = await fetch(WAHOO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }).toString(),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Wahoo-Anmeldung fehlgeschlagen (${response.status}): ${text.slice(0, 300)}`)
  }
  return JSON.parse(text) as WahooTokenResponse
}

function toTokens(response: WahooTokenResponse, previous: ProviderTokens | null): ProviderTokens {
  const accessToken = response.access_token ?? ''
  if (accessToken === '') {
    throw new Error('Wahoo hat kein Zugriffstoken zurueckgegeben.')
  }
  const expiresIn = Number(response.expires_in ?? 3600)
  const lifetime = Number.isFinite(expiresIn) ? expiresIn : 3600
  return {
    accessToken,
    // Wahoo does not always send a new refresh token on renewal.
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + Math.max(lifetime - EXPIRY_SAFETY_SEC, 0) * 1000,
    scope: response.scope ?? previous?.scope ?? null,
  }
}

function startOfDayMs(dayKey: string): number {
  const date = fromDayKey(dayKey)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

async function getJson<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const query = params === undefined ? '' : `?${new URLSearchParams(params).toString()}`
  const response = await fetch(`${WAHOO_API_BASE}${path}${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Wahoo ${path} (${response.status}): ${text.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

export class WahooAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'wahoo'
  readonly label = 'Wahoo'
  readonly capabilities: ProviderCapabilities = {
    activities: true,
    // The per-second series live in the FIT file, which this adapter does not
    // download, so there are no streams and no track yet.
    activityStreams: false,
    gps: false,
    // Wahoo returns no zone durations at all.
    hrZones: false,
    powerZones: false,
    hrv: false,
    restingHeartRate: false,
    sleep: false,
    recoveryScore: false,
    weight: false,
  }

  private readonly userId: string

  constructor(userId: string = DEFAULT_USER_ID) {
    this.userId = userId
  }

  isConfigured(): boolean {
    return Boolean(process.env.WAHOO_CLIENT_ID) && Boolean(process.env.WAHOO_CLIENT_SECRET)
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const { clientId } = readCredentials()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: WAHOO_SCOPES,
      state,
    })
    return `${WAHOO_AUTH_URL}?${params.toString()}`
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    const response = await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    })
    return toTokens(response, null)
  }

  async refresh(tokens: ProviderTokens): Promise<ProviderTokens> {
    if (tokens.refreshToken === null) {
      throw new Error('Wahoo-Verbindung laesst sich nicht erneuern: kein Refresh-Token vorhanden.')
    }
    const response = await postToken({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    })
    return toTokens(response, tokens)
  }

  async fetch(tokens: ProviderTokens, range: DateRange, userId?: string): Promise<ProviderFetchResult> {
    const from = startOfDayMs(range.from)
    const to = startOfDayMs(range.to)
    const ctx: MappingContext = { userId: userId ?? this.userId, syncedAt: new Date().toISOString() }
    const token = tokens.accessToken

    const activities: Activity[] = []
    let page = 1
    let reachedEnd = false

    // The list comes back newest first, so the first workout older than the
    // range start ends the walk.
    while (page <= MAX_PAGES && !reachedEnd) {
      const body = await getJson<WahooWorkoutPage>(token, '/v1/workouts', {
        page: String(page),
        per_page: String(PAGE_SIZE),
      })
      const workouts = body.workouts ?? []
      if (workouts.length === 0) break

      for (const workout of workouts) {
        const startedAt = Date.parse(workout.starts ?? '')
        if (!Number.isFinite(startedAt)) continue
        if (startedAt < from) {
          reachedEnd = true
          break
        }
        if (startedAt >= to) continue

        // The list does not always carry the summary; then it is loaded singly.
        let summary = workout.workout_summary ?? null
        if (summary === null && workout.id !== null && workout.id !== undefined) {
          summary = await this.loadSummary(token, String(workout.id))
        }
        const activity = wahooWorkoutToActivity({ ...workout, workout_summary: summary }, ctx)
        if (activity !== null) activities.push(activity)
      }
      page += 1
    }

    // Wahoo has no health, sleep or recovery resources.
    return { activities, dailyHealth: [], sleep: [], recovery: [] }
  }

  /** A missing summary must not abort the whole sync, so the failure is absorbed. */
  private async loadSummary(
    accessToken: string,
    workoutId: string,
  ): Promise<WahooWorkoutSummary | null> {
    try {
      return await getJson<WahooWorkoutSummary>(
        accessToken,
        `/v1/workouts/${workoutId}/workout_summary`,
      )
    } catch {
      return null
    }
  }
}

export const wahooAdapter = new WahooAdapter()
