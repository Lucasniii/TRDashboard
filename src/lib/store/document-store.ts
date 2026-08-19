// server-only: keeps deployed data in Supabase while local development uses
// the file store. Neither configuration value is exposed to the browser.

import path from 'node:path'

import {
  readDocument as readLocalDocument,
  removeDocument as removeLocalDocument,
  writeDocument as writeLocalDocument,
} from './file-store'

interface RemoteStoreConfig {
  url: string
  key: string
}

function copyFallback<T>(fallback: T): T {
  try {
    return structuredClone(fallback)
  } catch {
    return fallback
  }
}

function documentName(name: string): string {
  return path.basename(name).replace(/\.json$/i, '')
}

function remoteConfig(): RemoteStoreConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') ?? ''
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? ''
  return url === '' || key === '' ? null : { url, key }
}

function remoteUrl(config: RemoteStoreConfig, name: string, select?: string): string {
  const url = new URL('/rest/v1/trdashboard_documents', config.url)
  url.searchParams.set('name', `eq.${documentName(name)}`)
  if (select !== undefined) url.searchParams.set('select', select)
  return url.toString()
}

function headers(config: RemoteStoreConfig): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  }
}

/** Reads from the private document table when deployed, otherwise from disk. */
export async function readDocument<T>(name: string, fallback: T): Promise<T> {
  const config = remoteConfig()
  if (config === null) return readLocalDocument(name, fallback)

  try {
    const response = await fetch(remoteUrl(config, name, 'payload'), {
      headers: headers(config),
      cache: 'no-store',
    })
    if (!response.ok) return copyFallback(fallback)
    const rows: unknown = await response.json()
    if (!Array.isArray(rows) || rows.length === 0) return copyFallback(fallback)
    const row = rows[0]
    if (typeof row !== 'object' || row === null || !('payload' in row)) return copyFallback(fallback)
    const payload = (row as { payload: unknown }).payload
    return payload === null || payload === undefined ? copyFallback(fallback) : (payload as T)
  } catch {
    // A read failure must not take the whole dashboard down; the caller gets
    // the same first-run behaviour as for a missing local document.
    return copyFallback(fallback)
  }
}

/** Upserts one private JSON document. Failures remain server-side and generic. */
export async function writeDocument<T>(name: string, value: T): Promise<void> {
  const config = remoteConfig()
  if (config === null) {
    writeLocalDocument(name, value)
    return
  }

  const response = await fetch(new URL('/rest/v1/trdashboard_documents', config.url), {
    method: 'POST',
    headers: {
      ...headers(config),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ name: documentName(name), payload: value }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Das Dashboard konnte seine Daten nicht speichern.')
}

export async function removeDocument(name: string): Promise<void> {
  const config = remoteConfig()
  if (config === null) {
    removeLocalDocument(name)
    return
  }

  const response = await fetch(remoteUrl(config, name), {
    method: 'DELETE',
    headers: headers(config),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Das Dashboard konnte seine Daten nicht löschen.')
}
