// server-only: this module touches the local filesystem with node:fs and must
// never be imported from a client component.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 3 keeps everything on disk instead of in a database: one JSON document
 * per collection under `<repo>/data`. That directory is gitignored, is created
 * on demand and is written with restrictive permissions, because `tokens.json`
 * holds live OAuth credentials.
 *
 * Two rules make the store safe enough for a single-user local app:
 *   - every write is atomic (temp file + rename), so a crash mid-write can
 *     never leave a truncated document behind;
 *   - every read is total — a missing, unreadable or corrupt file yields the
 *     caller's fallback instead of throwing and taking a page down with it.
 *
 * Callers must therefore always read, merge and write inside a single function
 * call; there is no locking, and a read-modify-write split across awaits would
 * lose data.
 */
export const DATA_DIR: string = path.join(process.cwd(), 'data')

/** Owner read/write only — the token document must not be world-readable. */
const DOCUMENT_MODE = 0o600
const DIRECTORY_MODE = 0o700

/**
 * Documents are addressed by bare name ('tokens', 'activities'). `basename`
 * strips any path segments, so a name can never escape DATA_DIR.
 */
function documentPath(name: string): string {
  const base = path.basename(name).replace(/\.json$/i, '')
  return path.join(DATA_DIR, `${base}.json`)
}

function temporaryPath(name: string): string {
  return `${documentPath(name)}.tmp`
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: DIRECTORY_MODE })
}

/**
 * The fallback is handed back as a copy so a caller cannot mutate a shared
 * default (DEFAULT_SETTINGS) through a value it believes it owns.
 */
function copyFallback<T>(fallback: T): T {
  try {
    return structuredClone(fallback)
  } catch {
    return fallback
  }
}

/** Never throws: anything unreadable or unparsable is treated as "not there". */
export function readDocument<T>(name: string, fallback: T): T {
  let raw: string
  try {
    raw = fs.readFileSync(documentPath(name), 'utf8')
  } catch {
    return copyFallback(fallback)
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || parsed === undefined) return copyFallback(fallback)
    return parsed as T
  } catch {
    // A corrupt document is not worth crashing over; the next write repairs it.
    return copyFallback(fallback)
  }
}

/** Atomic: writes `<name>.json.tmp` and renames it over `<name>.json`. */
export function writeDocument<T>(name: string, value: T): void {
  ensureDataDir()
  const target = documentPath(name)
  const temporary = temporaryPath(name)
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: DOCUMENT_MODE,
  })
  try {
    // writeFileSync only applies `mode` when it creates the file, so a leftover
    // temp file from an earlier crash could carry looser permissions.
    fs.chmodSync(temporary, DOCUMENT_MODE)
    fs.renameSync(temporary, target)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

export function removeDocument(name: string): void {
  fs.rmSync(documentPath(name), { force: true })
  fs.rmSync(temporaryPath(name), { force: true })
}

export function documentExists(name: string): boolean {
  return fs.existsSync(documentPath(name))
}
