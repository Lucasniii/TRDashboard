// server-only: talks to the provider adapters and writes the local JSON store,
// so this module must never be imported from a client component.

import { randomUUID } from 'node:crypto'

import { addDays, toDayKey } from '@/lib/date'
import type { DateRange, ProviderId, SyncJob } from '@/lib/domain/types'
import { PROVIDER_ORDER, getAdapter, getProviderLabel } from '@/lib/providers/registry'
import type { ProviderFetchResult, ProviderTokens } from '@/lib/providers/types'
import {
  appendSyncJob,
  upsertActivities,
  upsertDailyHealth,
  upsertRecovery,
  upsertSleep,
} from '@/lib/store/records'
import {
  ProviderAuthError,
  connectionStates,
  getUsableTokens,
  markSynced,
} from '@/lib/store/tokens'

/**
 * One sync run: fetch a date window from a provider, upsert what came back and
 * record the outcome.
 *
 * Three states, deliberately distinct, because the settings view reacts to each
 * one differently:
 *   - `skipped`   — nothing to do, the provider was never connected;
 *   - `failed`    — the run started and broke; the error is a German sentence
 *                   the UI can show unchanged, and `lastSyncAt` stays where it
 *                   was so the last good run is still visible;
 *   - `succeeded` — rows were written (a window with no new data is a success
 *                   with zero counts, not a failure).
 *
 * Runs are sequential on purpose. The file store has no locking, so two
 * providers writing `activities.json` at the same time would lose rows.
 */

/** Deep enough for a base period, small enough to stay inside provider rate limits. */
const DEFAULT_WINDOW_DAYS = 120
const MIN_WINDOW_DAYS = 1
const MAX_WINDOW_DAYS = 730

export interface SyncOutcome {
  provider: ProviderId
  status: 'succeeded' | 'failed' | 'skipped'
  counts: {
    activities: number
    dailyHealth: number
    sleep: number
    recovery: number
  }
  error: string | null
}

const NO_COUNTS: SyncOutcome['counts'] = {
  activities: 0,
  dailyHealth: 0,
  sleep: 0,
  recovery: 0,
}

function emptyCounts(): SyncOutcome['counts'] {
  return { ...NO_COUNTS }
}

/** Half-open [from, to): `to` is tomorrow, so today is always included. */
export function defaultRange(days: number = DEFAULT_WINDOW_DAYS, today: Date = new Date()): DateRange {
  const span = Number.isFinite(days)
    ? Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.round(days)))
    : DEFAULT_WINDOW_DAYS
  return {
    from: toDayKey(addDays(today, -(span - 1))),
    to: toDayKey(addDays(today, 1)),
  }
}

/**
 * Turns whatever an adapter threw into a sentence the user can act on. A 401
 * means the grant is gone rather than the request being wrong, so it gets its
 * own wording pointing at the reconnect button.
 */
function describeFailure(provider: ProviderId, error: unknown): string {
  const label = getProviderLabel(provider)
  if (error instanceof ProviderAuthError) return error.message
  const detail = error instanceof Error ? error.message : String(error)
  if (/\(401\)/.test(detail) || /\b401\b/.test(detail)) {
    return `Die Verbindung zu ${label} wurde vom Anbieter abgelehnt. Bitte ${label} neu verbinden.`
  }
  if (detail.trim() === '') return `Die Synchronisierung mit ${label} ist fehlgeschlagen.`
  return `Die Synchronisierung mit ${label} ist fehlgeschlagen: ${detail}`
}

async function writeResult(result: ProviderFetchResult): Promise<SyncOutcome['counts']> {
  return {
    activities: await upsertActivities(result.activities),
    dailyHealth: await upsertDailyHealth(result.dailyHealth),
    sleep: await upsertSleep(result.sleep),
    recovery: await upsertRecovery(result.recovery),
  }
}

async function recordJob(
  provider: ProviderId,
  startedAt: string,
  status: SyncJob['status'],
  counts: SyncOutcome['counts'],
  error: string | null,
): Promise<void> {
  await appendSyncJob({
    id: randomUUID(),
    provider,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    recordCounts: {
      activities: counts.activities,
      health: counts.dailyHealth,
      sleep: counts.sleep,
      recovery: counts.recovery,
    },
    error,
  })
}

function skipped(provider: ProviderId, reason: string | null): SyncOutcome {
  return { provider, status: 'skipped', counts: emptyCounts(), error: reason }
}

export async function syncProvider(provider: ProviderId, days?: number): Promise<SyncOutcome> {
  const adapter = getAdapter(provider)
  if (adapter === null) {
    return skipped(provider, `Für ${getProviderLabel(provider)} gibt es noch keine Anbindung.`)
  }

  const startedAt = new Date().toISOString()

  let tokens: ProviderTokens | null
  try {
    tokens = await getUsableTokens(provider)
  } catch (error) {
    // Connected, but the token could not be renewed — a real failure, and the
    // stored connection stays in place so the user can retry or reconnect.
    const message = describeFailure(provider, error)
    await recordJob(provider, startedAt, 'failed', emptyCounts(), message)
    return { provider, status: 'failed', counts: emptyCounts(), error: message }
  }

  if (tokens === null) {
    return skipped(provider, `${getProviderLabel(provider)} ist nicht verbunden.`)
  }

  const range = defaultRange(days ?? DEFAULT_WINDOW_DAYS)

  try {
    const result = await adapter.fetch(tokens, range)
    const counts = await writeResult(result)
    const finishedAt = new Date().toISOString()
    await markSynced(provider, finishedAt)
    await recordJob(provider, startedAt, 'succeeded', counts, null)
    return { provider, status: 'succeeded', counts, error: null }
  } catch (error) {
    const message = describeFailure(provider, error)
    // No markSynced: a failed run must not look like fresh data.
    await recordJob(provider, startedAt, 'failed', emptyCounts(), message)
    return { provider, status: 'failed', counts: emptyCounts(), error: message }
  }
}

/** Every connected provider, in display order, one after the other. */
export async function syncAllConnected(days?: number): Promise<SyncOutcome[]> {
  const states = await connectionStates()
  const providers = PROVIDER_ORDER.filter(
    (id) => getAdapter(id) !== null && states[id]?.connected === true,
  )

  const outcomes: SyncOutcome[] = []
  for (const provider of providers) {
    // syncProvider never throws, so one broken provider cannot stop the next.
    outcomes.push(await syncProvider(provider, days))
  }
  return outcomes
}
