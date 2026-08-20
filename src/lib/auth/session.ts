// server-only: maps an opaque, HttpOnly browser cookie to one dashboard user.

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'trdashboard_session'
const SESSION_DAYS = 30

interface Config {
  url: string
  key: string
}

interface SessionRow {
  user_id: string
  expires_at: string
}

interface UserRow {
  id: string
  whoop_user_id: string
  display_name: string | null
  email: string | null
}

export interface CurrentUser {
  id: string
  whoopUserId: string
  displayName: string | null
  email: string | null
}

function config(): Config {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  if (url === '' || key === '') throw new Error('Die geschützte Datenspeicherung ist nicht eingerichtet.')
  return { url, key }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config()
  const response = await fetch(new URL(path, url), {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Die Anmeldesitzung konnte nicht gespeichert werden.')
  if (response.status === 204) return undefined as T
  const body = await response.text()
  return (body === '' ? undefined : JSON.parse(body)) as T
}

export async function upsertWhoopUser(identity: {
  whoopUserId: string
  displayName: string | null
  email: string | null
}): Promise<CurrentUser> {
  const rows = await request<UserRow[]>('/rest/v1/trdashboard_users?on_conflict=whoop_user_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      whoop_user_id: identity.whoopUserId,
      display_name: identity.displayName,
      email: identity.email,
      updated_at: new Date().toISOString(),
    }),
  })
  const row = rows[0]
  if (row === undefined) throw new Error('Das WHOOP-Konto konnte nicht angelegt werden.')
  return { id: row.id, whoopUserId: row.whoop_user_id, displayName: row.display_name, email: row.email }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await request<unknown>('/rest/v1/trdashboard_sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, token_hash: hash(token), expires_at: expiresAt }),
  })
  return token
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  }
}

export function expiredSessionCookie() {
  return { ...sessionCookie(''), maxAge: 0 }
}

/** Invalidates the current opaque token server-side before the browser forgets it. */
export async function clearCurrentSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (token === undefined) return
  const { url, key } = config()
  const response = await fetch(
    new URL(`/rest/v1/trdashboard_sessions?token_hash=eq.${encodeURIComponent(hash(token))}`, url),
    {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
      cache: 'no-store',
    },
  )
  if (!response.ok) throw new Error('Die Anmeldesitzung konnte nicht beendet werden.')
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (token === undefined) return null
  const sessions = await request<SessionRow[]>(
    `/rest/v1/trdashboard_sessions?token_hash=eq.${encodeURIComponent(hash(token))}&select=user_id,expires_at&limit=1`,
  )
  const session = sessions[0]
  if (session === undefined || new Date(session.expires_at).getTime() <= Date.now()) return null
  const users = await request<UserRow[]>(
    `/rest/v1/trdashboard_users?id=eq.${encodeURIComponent(session.user_id)}&select=id,whoop_user_id,display_name,email&limit=1`,
  )
  const user = users[0]
  return user === undefined
    ? null
    : { id: user.id, whoopUserId: user.whoop_user_id, displayName: user.display_name, email: user.email }
}
