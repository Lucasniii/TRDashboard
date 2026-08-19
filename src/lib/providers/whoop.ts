// server-only: reads credentials from process.env and must never be bundled
// into a client component.
import { fromDayKey } from '@/lib/date'
import type {
  Activity,
  DailyHealthMetrics,
  DateRange,
  ProviderCapabilities,
  ProviderId,
  RecoveryMetric,
  SleepSession,
} from '@/lib/domain/types'
import {
  DEFAULT_USER_ID,
  whoopRecoveryToDaily,
  whoopRecoveryToRecoveryMetric,
  whoopSleepToSession,
  whoopWorkoutToActivity,
  withRespiratoryRateFromSleep,
  type MappingContext,
  type WhoopCycleRecord,
  type WhoopRecoveryRecord,
  type WhoopSleepRecord,
  type WhoopWorkoutRecord,
} from './mapping'
import type { ProviderAdapter, ProviderFetchResult, ProviderTokens } from './types'

/**
 * WHOOP API v2. Endpoints, scopes and field names are carried over from the
 * previous, working integration — see the notes on `WHOOP_SCOPES` and
 * `refresh()`, both of which are easy to get wrong and fail silently.
 */

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer'

/**
 * "offline" is not optional: without it WHOOP issues no refresh token at all
 * and the connection dies with the first access token.
 */
const WHOOP_SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:workout',
  'read:sleep',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ')

const PAGE_SIZE = 25
/** Stops a runaway loop if next_token ever fails to terminate. */
const MAX_PAGES = 40
/** Renew a minute early so a request cannot start on an expiring token. */
const EXPIRY_SAFETY_SEC = 60

interface WhoopPage<T> {
  records?: T[] | null
  next_token?: string | null
}

interface WhoopTokenResponse {
  access_token?: string | null
  refresh_token?: string | null
  expires_in?: number | string | null
  scope?: string | null
  token_type?: string | null
}

interface WhoopCredentials {
  clientId: string
  clientSecret: string
}

function readCredentials(): WhoopCredentials {
  const clientId = process.env.WHOOP_CLIENT_ID ?? ''
  const clientSecret = process.env.WHOOP_CLIENT_SECRET ?? ''
  if (clientId === '' || clientSecret === '') {
    throw new Error('WHOOP ist nicht eingerichtet: WHOOP_CLIENT_ID und WHOOP_CLIENT_SECRET fehlen.')
  }
  return { clientId, clientSecret }
}

/** Both providers expect the credentials as form fields, not as a Basic header. */
async function postToken(body: Record<string, string>): Promise<WhoopTokenResponse> {
  const { clientId, clientSecret } = readCredentials()
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }).toString(),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`WHOOP-Anmeldung fehlgeschlagen (${response.status}): ${text.slice(0, 300)}`)
  }
  return JSON.parse(text) as WhoopTokenResponse
}

function toTokens(response: WhoopTokenResponse, previous: ProviderTokens | null): ProviderTokens {
  const accessToken = response.access_token ?? ''
  if (accessToken === '') {
    throw new Error('WHOOP hat kein Zugriffstoken zurueckgegeben.')
  }
  const expiresIn = Number(response.expires_in ?? 3600)
  const lifetime = Number.isFinite(expiresIn) ? expiresIn : 3600
  return {
    accessToken,
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + Math.max(lifetime - EXPIRY_SAFETY_SEC, 0) * 1000,
    scope: response.scope ?? previous?.scope ?? null,
  }
}

/** Half-open day keys become the ISO instants the API filters on. */
function startOfDayIso(dayKey: string): string {
  const date = fromDayKey(dayKey)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

async function getPaged<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const records: T[] = []
  let nextToken: string | null = null
  let page = 0

  do {
    const query = new URLSearchParams({ ...params, limit: String(PAGE_SIZE) })
    if (nextToken !== null) query.set('nextToken', nextToken)
    const response = await fetch(`${WHOOP_API_BASE}${path}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`WHOOP ${path} (${response.status}): ${text.slice(0, 200)}`)
    }
    const body = (await response.json()) as WhoopPage<T>
    if (body.records) records.push(...body.records)
    nextToken = body.next_token ?? null
    page += 1
  } while (nextToken !== null && page < MAX_PAGES)

  return records
}

export class WhoopAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'whoop'
  readonly label = 'WHOOP'
  readonly capabilities: ProviderCapabilities = {
    activities: true,
    // The strap delivers summaries only, no per-second series and no track.
    activityStreams: false,
    gps: false,
    hrZones: true,
    powerZones: false,
    hrv: true,
    restingHeartRate: true,
    sleep: true,
    recoveryScore: true,
    // Body measurements are in scope but this adapter does not read them yet.
    weight: false,
  }

  private readonly userId: string

  constructor(userId: string = DEFAULT_USER_ID) {
    this.userId = userId
  }

  isConfigured(): boolean {
    return Boolean(process.env.WHOOP_CLIENT_ID) && Boolean(process.env.WHOOP_CLIENT_SECRET)
  }

  getAuthorizationUrl(state: string, redirectUri: string): string {
    const { clientId } = readCredentials()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: WHOOP_SCOPES,
      state,
    })
    return `${WHOOP_AUTH_URL}?${params.toString()}`
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
      throw new Error('WHOOP-Verbindung laesst sich nicht erneuern: kein Refresh-Token vorhanden.')
    }
    const response = await postToken({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      // Without scope=offline the refresh returns no new token pair.
      scope: 'offline',
    })
    return toTokens(response, tokens)
  }

  async fetch(tokens: ProviderTokens, range: DateRange): Promise<ProviderFetchResult> {
    const params = { start: startOfDayIso(range.from), end: startOfDayIso(range.to) }
    const ctx: MappingContext = { userId: this.userId, syncedAt: new Date().toISOString() }
    const token = tokens.accessToken

    // Sequential on purpose: WHOOP rate limits per minute, and four parallel
    // paginated walks trip that limit on a first full sync.
    const recoveryRecords = await getPaged<WhoopRecoveryRecord>(token, '/v2/recovery', params)
    const sleepRecords = await getPaged<WhoopSleepRecord>(token, '/v2/activity/sleep', params)
    const workoutRecords = await getPaged<WhoopWorkoutRecord>(token, '/v2/activity/workout', params)
    const cycleRecords = await getPaged<WhoopCycleRecord>(token, '/v2/cycle', params)

    // Operational diagnostics only: counts make an empty sync explainable
    // without ever writing a token, user id, or a health record to the log.
    console.info(
      `WHOOP-Abruf: recovery=${recoveryRecords.length}, sleep=${sleepRecords.length}, workout=${workoutRecords.length}, cycle=${cycleRecords.length}`,
    )

    const cyclesById = new Map<string, WhoopCycleRecord>()
    for (const cycle of cycleRecords) {
      if (cycle.id !== null && cycle.id !== undefined) cyclesById.set(String(cycle.id), cycle)
    }

    const activities: Activity[] = []
    for (const record of workoutRecords) {
      const activity = whoopWorkoutToActivity(record, ctx)
      if (activity !== null) activities.push(activity)
    }

    const sleep: SleepSession[] = []
    for (const record of sleepRecords) {
      const session = whoopSleepToSession(record, ctx)
      if (session !== null) sleep.push(session)
    }

    const dailyHealth: DailyHealthMetrics[] = []
    const recovery: RecoveryMetric[] = []
    for (const record of recoveryRecords) {
      const day = whoopRecoveryToDaily(record, ctx)
      if (day !== null) dailyHealth.push(day)
      const cycle = record.cycle_id === null || record.cycle_id === undefined
        ? null
        : (cyclesById.get(String(record.cycle_id)) ?? null)
      const metric = whoopRecoveryToRecoveryMetric(record, cycle, ctx)
      if (metric !== null) recovery.push(metric)
    }

    const result = {
      activities,
      dailyHealth: withRespiratoryRateFromSleep(dailyHealth, sleep),
      sleep,
      recovery,
    }
    console.info(
      `WHOOP-Import: activities=${result.activities.length}, dailyHealth=${result.dailyHealth.length}, sleep=${result.sleep.length}, recovery=${result.recovery.length}`,
    )
    return result
  }
}

export const whoopAdapter = new WhoopAdapter()
