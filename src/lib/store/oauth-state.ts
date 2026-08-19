// server-only: persists OAuth state through file-store and must never be
// imported from a client component.

import { randomBytes } from 'node:crypto'
import type { ProviderId } from '@/lib/domain/types'
import { readDocument, writeDocument } from './document-store'

/**
 * CSRF protection for the OAuth round trip. The route handler mints a state
 * before redirecting to the provider and consumes it in the callback; a
 * callback whose state is unknown, already used or older than ten minutes is
 * not ours and gets rejected.
 *
 * The entries live on disk rather than in memory because Next.js may serve the
 * redirect and the callback from different worker processes.
 */

const DOCUMENT = 'oauth-state'
const TTL_MS = 10 * 60 * 1000

interface StateEntry {
  provider: ProviderId
  state: string
  createdAt: number
}

function isEntry(value: unknown): value is StateEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StateEntry>
  return (
    typeof candidate.provider === 'string' &&
    typeof candidate.state === 'string' &&
    typeof candidate.createdAt === 'number'
  )
}

async function readEntries(now: number): Promise<StateEntry[]> {
  const stored = await readDocument<unknown[]>(DOCUMENT, [])
  if (!Array.isArray(stored)) return []
  return stored.filter(isEntry).filter((entry) => now - entry.createdAt < TTL_MS)
}

/** Random, single-use, persisted with its issue time. */
export async function createState(provider: ProviderId): Promise<string> {
  const now = Date.now()
  const state = randomBytes(32).toString('base64url')
  // Pruning happens on every write, so an abandoned flow cannot pile up.
  const entries = await readEntries(now)
  entries.push({ provider, state, createdAt: now })
  await writeDocument(DOCUMENT, entries)
  return state
}

/**
 * True exactly once per state. Also prunes expired entries, so the document
 * stays small without a separate cleanup job.
 */
export async function consumeState(provider: ProviderId, state: string | null): Promise<boolean> {
  const now = Date.now()
  const entries = await readEntries(now)
  if (state === null || state.length === 0) {
    // Still worth persisting the prune we just did.
    await writeDocument(DOCUMENT, entries)
    return false
  }
  const index = entries.findIndex((entry) => entry.provider === provider && entry.state === state)
  if (index >= 0) entries.splice(index, 1)
  await writeDocument(DOCUMENT, entries)
  return index >= 0
}
