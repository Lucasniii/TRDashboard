// server-only: user-scoped health records are isolated by user_id and only the
// server's Supabase secret can access them.

interface Config {
  url: string
  key: string
}

function config(): Config {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  if (url === '' || key === '') throw new Error('Die geschützte Datenspeicherung ist nicht eingerichtet.')
  return { url, key }
}

function copy<T>(value: T): T {
  try { return structuredClone(value) } catch { return value }
}

function headers(): HeadersInit {
  const { key } = config()
  return { apikey: key, Authorization: `Bearer ${key}` }
}

function url(userId: string, name: string, select?: string): string {
  const target = new URL('/rest/v1/trdashboard_user_documents', config().url)
  target.searchParams.set('user_id', `eq.${userId}`)
  target.searchParams.set('name', `eq.${name}`)
  if (select !== undefined) target.searchParams.set('select', select)
  return target.toString()
}

export async function readUserDocument<T>(userId: string, name: string, fallback: T): Promise<T> {
  const response = await fetch(url(userId, name, 'payload'), { headers: headers(), cache: 'no-store' })
  if (!response.ok) throw new Error('Eigene Daten konnten nicht geladen werden.')
  const rows = (await response.json()) as Array<{ payload?: unknown }>
  const payload = rows[0]?.payload
  return payload === undefined || payload === null ? copy(fallback) : (payload as T)
}

export async function writeUserDocument<T>(userId: string, name: string, payload: T): Promise<void> {
  const { url: base } = config()
  const response = await fetch(new URL('/rest/v1/trdashboard_user_documents', base), {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: userId, name, payload, updated_at: new Date().toISOString() }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Eigene Daten konnten nicht gespeichert werden.')
}
