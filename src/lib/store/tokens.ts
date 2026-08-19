// server-only: reads and writes OAuth credentials on disk and must never be
// imported from a client component.

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import type { ProviderTokens } from '@/lib/providers/types'
import { readDocument, writeDocument } from './file-store'

/**
 * The connection book: which providers are linked, with which tokens and when
 * they last delivered data. Everything lives in `data/tokens.json`.
 *
 * The one subtlety is refreshing. `getUsableTokens` distinguishes two failures
 * that look alike from the outside:
 *   - not connected at all -> null, so the UI offers the connect button;
 *   - connected but the refresh was rejected -> ProviderAuthError, so the UI
 *     can say the connection expired and must be re-established.
 * A rejected refresh deliberately leaves the stored record alone: a network
 * blip must not silently disconnect a working integration.
 */

const DOCUMENT = 'tokens'
/** Renew a minute early so a request cannot start on an expiring token. */
const REFRESH_MARGIN_MS = 60 * 1000

export interface ConnectionRecord {
  tokens: ProviderTokens
  connectedAt: string
  lastSyncAt: string | null
}

/** Thrown when a stored connection exists but can no longer be renewed. */
export class ProviderAuthError extends Error {
  readonly provider: ProviderId

  constructor(provider: ProviderId, message: string) {
    super(message)
    this.name = 'ProviderAuthError'
    this.provider = provider
  }
}

type ConnectionDocument = Partial<Record<ProviderId, ConnectionRecord>>

function isConnectionRecord(value: unknown): value is ConnectionRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ConnectionRecord>
  const tokens = candidate.tokens
  if (typeof tokens !== 'object' || tokens === null) return false
  const shape = tokens as Partial<ProviderTokens>
  return (
    typeof shape.accessToken === 'string' &&
    shape.accessToken.length > 0 &&
    typeof shape.expiresAt === 'number' &&
    typeof candidate.connectedAt === 'string'
  )
}

function readAll(): ConnectionDocument {
  const stored = readDocument<Record<string, unknown>>(DOCUMENT, {})
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  const document: ConnectionDocument = {}
  for (const [provider, record] of Object.entries(stored)) {
    if (isConnectionRecord(record)) document[provider as ProviderId] = record
  }
  return document
}

export function readConnection(provider: ProviderId): ConnectionRecord | null {
  return readAll()[provider] ?? null
}

/**
 * Re-authorising keeps the original `connectedAt` and the last sync time, and
 * keeps the previous refresh token whenever the provider omits it — Wahoo
 * returns only a new access token on a refresh, and dropping the old refresh
 * token there would end the connection one hour later.
 */
export function saveConnection(provider: ProviderId, tokens: ProviderTokens): ConnectionRecord {
  const document = readAll()
  const existing = document[provider] ?? null
  const record: ConnectionRecord = {
    tokens: {
      ...tokens,
      refreshToken: tokens.refreshToken ?? existing?.tokens.refreshToken ?? null,
      scope: tokens.scope ?? existing?.tokens.scope ?? null,
    },
    connectedAt: existing?.connectedAt ?? new Date().toISOString(),
    lastSyncAt: existing?.lastSyncAt ?? null,
  }
  document[provider] = record
  writeDocument(DOCUMENT, document)
  return record
}

export function clearConnection(provider: ProviderId): void {
  const document = readAll()
  if (document[provider] === undefined) return
  delete document[provider]
  writeDocument(DOCUMENT, document)
}

export function isConnected(provider: ProviderId): boolean {
  return readConnection(provider) !== null
}

export function markSynced(provider: ProviderId, at: string): void {
  const document = readAll()
  const record = document[provider]
  if (record === undefined) return
  document[provider] = { ...record, lastSyncAt: at }
  writeDocument(DOCUMENT, document)
}

/** Feeds `describeAllDataSources` in the Einstellungen view. */
export function connectionStates(): Partial<
  Record<ProviderId, { connected: boolean; lastSyncAt: string | null }>
> {
  const states: Partial<Record<ProviderId, { connected: boolean; lastSyncAt: string | null }>> = {}
  for (const [provider, record] of Object.entries(readAll())) {
    if (record === undefined) continue
    states[provider as ProviderId] = { connected: true, lastSyncAt: record.lastSyncAt }
  }
  return states
}

/**
 * Tokens ready for an API call, refreshed if they are about to expire.
 * Returns null when the provider was never connected; throws
 * `ProviderAuthError` when a stored connection can no longer be renewed.
 */
export async function getUsableTokens(provider: ProviderId): Promise<ProviderTokens | null> {
  const record = readConnection(provider)
  if (record === null) return null

  if (record.tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return record.tokens

  const adapter = getAdapter(provider)
  if (adapter === null) {
    throw new ProviderAuthError(
      provider,
      'Für diese Datenquelle gibt es keinen Adapter, die Verbindung lässt sich nicht erneuern.',
    )
  }
  if (record.tokens.refreshToken === null) {
    throw new ProviderAuthError(
      provider,
      'Die Verbindung ist abgelaufen und es liegt kein Refresh-Token vor. Bitte neu verbinden.',
    )
  }

  let refreshed: ProviderTokens
  try {
    refreshed = await adapter.refresh(record.tokens)
  } catch (error) {
    // The record stays untouched: a temporary failure must not disconnect a
    // connection the user would otherwise keep.
    const detail = error instanceof Error ? error.message : String(error)
    throw new ProviderAuthError(
      provider,
      `Die Verbindung ließ sich nicht erneuern: ${detail}`,
    )
  }
  return saveConnection(provider, refreshed).tokens
}
