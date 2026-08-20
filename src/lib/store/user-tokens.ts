// server-only: per-user provider credentials, encrypted at rest.

import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import type { ProviderTokens } from '@/lib/providers/types'
import { decryptTokenPayload, encryptTokenPayload } from '@/lib/auth/token-crypto'

interface StoredConnection {
  encrypted_tokens: string
  last_sync_at: string | null
  connected_at: string
}

interface ConnectionRecord {
  tokens: ProviderTokens
  connectedAt: string
  lastSyncAt: string | null
}

const REFRESH_MARGIN_MS = 60_000

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  if (url === '' || key === '') throw new Error('Die geschützte Datenspeicherung ist nicht eingerichtet.')
  return { url, key }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config()
  const response = await fetch(new URL(path, url), {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Die geschützte Anbieter-Verbindung konnte nicht gespeichert werden.')
  if (response.status === 204) return undefined as T
  const body = await response.text()
  return (body === '' ? undefined : JSON.parse(body)) as T
}

async function readConnection(userId: string, provider: ProviderId): Promise<ConnectionRecord | null> {
  const rows = await request<StoredConnection[]>(
    `/rest/v1/trdashboard_provider_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}&select=encrypted_tokens,last_sync_at,connected_at&limit=1`,
  )
  const row = rows[0]
  if (row === undefined) return null
  return {
    tokens: decryptTokenPayload<ProviderTokens>(row.encrypted_tokens),
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  }
}

export async function saveUserConnection(userId: string, provider: ProviderId, tokens: ProviderTokens): Promise<void> {
  const existing = await readConnection(userId, provider)
  const payload: ProviderTokens = {
    ...tokens,
    refreshToken: tokens.refreshToken ?? existing?.tokens.refreshToken ?? null,
    scope: tokens.scope ?? existing?.tokens.scope ?? null,
  }
  await request<unknown>('/rest/v1/trdashboard_provider_connections?on_conflict=user_id,provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      provider,
      encrypted_tokens: encryptTokenPayload(payload),
      connected_at: existing?.connectedAt ?? new Date().toISOString(),
      last_sync_at: existing?.lastSyncAt ?? null,
    }),
  })
}

export async function getUserTokens(userId: string, provider: ProviderId): Promise<ProviderTokens | null> {
  const connection = await readConnection(userId, provider)
  if (connection === null) return null
  if (connection.tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return connection.tokens
  const adapter = getAdapter(provider)
  if (adapter === null || connection.tokens.refreshToken === null) return null
  const refreshed = await adapter.refresh(connection.tokens)
  await saveUserConnection(userId, provider, refreshed)
  return refreshed
}

export async function isUserConnected(userId: string, provider: ProviderId): Promise<boolean> {
  return (await readConnection(userId, provider)) !== null
}

export async function userConnectionStates(userId: string): Promise<Partial<Record<ProviderId, { connected: boolean; lastSyncAt: string | null }>>> {
  const rows = await request<Array<{ provider: string; last_sync_at: string | null }>>(
    `/rest/v1/trdashboard_provider_connections?user_id=eq.${encodeURIComponent(userId)}&select=provider,last_sync_at`,
  )
  const states: Partial<Record<ProviderId, { connected: boolean; lastSyncAt: string | null }>> = {}
  for (const row of rows) {
    if (row.provider === 'whoop' || row.provider === 'wahoo') {
      states[row.provider] = { connected: true, lastSyncAt: row.last_sync_at }
    }
  }
  return states
}

export async function clearUserConnection(userId: string, provider: ProviderId): Promise<void> {
  await request<unknown>(
    `/rest/v1/trdashboard_provider_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}`,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
  )
}

export async function markUserSynced(userId: string, provider: ProviderId, at: string): Promise<void> {
  const connection = await readConnection(userId, provider)
  if (connection === null) return
  await request<unknown>(
    `/rest/v1/trdashboard_provider_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_sync_at: at }),
    },
  )
}
