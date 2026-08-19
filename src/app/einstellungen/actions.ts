'use server'

import { revalidatePath } from 'next/cache'

import {
  FTP_MAX,
  FTP_MIN,
  MAX_HEART_RATE_MAX,
  MAX_HEART_RATE_MIN,
  buildHeartRateZones,
  buildPowerZones,
} from '@/components/settings/zone-math'
import { getRepository } from '@/lib/data'
import type { ProviderId, UserSettings, WeeklyGoals } from '@/lib/domain/types'
import { getAdapter, getProviderLabel } from '@/lib/providers/registry'
import { deleteByProvider } from '@/lib/store/records'
import { clearConnection, connectionStates, isConnected } from '@/lib/store/tokens'
import { syncAllConnected, syncProvider, type SyncOutcome } from '@/lib/sync/run-sync'

/**
 * The one write path of the settings page. Both forms — Wochenziele and
 * Trainingszonen — send their own section through this action; it validates,
 * merges the section into the stored settings and persists the whole record
 * through the repository, so no field is lost by a partial save.
 *
 * Every message the user sees is German; the keys are English, like the rest of
 * the code.
 */

export type SettingsFieldKey =
  | 'duration'
  | 'distance'
  | 'elevation'
  | 'maxHeartRate'
  | 'ftpWatts'

/** Raw form strings — parsing and validation belong on the server. */
export interface SettingsFormInput {
  goals?: {
    /** Weekly training time in hours. */
    duration: string
    /** Weekly distance in kilometres. */
    distance: string
    /** Weekly elevation gain in metres. */
    elevation: string
  }
  zones?: {
    maxHeartRate: string
    ftpWatts: string
  }
}

export type SettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; errors: Partial<Record<SettingsFieldKey, string>> }

/** Weekly ceilings — anything beyond is a typo, not a goal. */
const MAX_GOAL_HOURS = 60
const MAX_GOAL_KM = 2000
const MAX_GOAL_ELEVATION_M = 30000

const MESSAGE_NOT_A_NUMBER = 'Bitte eine Zahl eingeben.'
const MESSAGE_REQUIRED = 'Bitte einen Wert eingeben.'
const MESSAGE_POSITIVE = 'Bitte einen Wert größer als 0 eingeben.'

type ParsedNumber =
  | { kind: 'empty' }
  | { kind: 'value'; value: number }
  | { kind: 'error'; message: string }

/** Accepts the de-AT decimal comma as well as the dot. */
function parseNumber(raw: string): ParsedNumber {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'empty' }
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return { kind: 'error', message: MESSAGE_NOT_A_NUMBER }
  return { kind: 'value', value }
}

interface GoalRule {
  key: SettingsFieldKey
  max: number
  tooLarge: string
}

/**
 * An empty goal field is not an error: it means "kein Wochenziel", which the
 * model stores as null. Only a value that is present and implausible fails.
 */
function readGoal(
  raw: string,
  rule: GoalRule,
  errors: Partial<Record<SettingsFieldKey, string>>,
): number | null {
  const parsed = parseNumber(raw)
  if (parsed.kind === 'empty') return null
  if (parsed.kind === 'error') {
    errors[rule.key] = parsed.message
    return null
  }
  if (parsed.value <= 0) {
    errors[rule.key] = MESSAGE_POSITIVE
    return null
  }
  if (parsed.value > rule.max) {
    errors[rule.key] = rule.tooLarge
    return null
  }
  return parsed.value
}

interface BasisRule {
  key: SettingsFieldKey
  min: number
  max: number
  outOfRange: string
}

/** Zone bases are required — without them there are no boundaries to compute. */
function readBasis(
  raw: string,
  rule: BasisRule,
  errors: Partial<Record<SettingsFieldKey, string>>,
): number | null {
  const parsed = parseNumber(raw)
  if (parsed.kind === 'empty') {
    errors[rule.key] = MESSAGE_REQUIRED
    return null
  }
  if (parsed.kind === 'error') {
    errors[rule.key] = parsed.message
    return null
  }
  const value = Math.round(parsed.value)
  if (value < rule.min || value > rule.max) {
    errors[rule.key] = rule.outOfRange
    return null
  }
  return value
}

export async function saveSettingsAction(
  input: SettingsFormInput,
): Promise<SettingsActionResult> {
  const errors: Partial<Record<SettingsFieldKey, string>> = {}

  let weeklyGoals: WeeklyGoals | null = null
  if (input.goals !== undefined) {
    const hours = readGoal(input.goals.duration, {
      key: 'duration',
      max: MAX_GOAL_HOURS,
      tooLarge: `Höchstens ${MAX_GOAL_HOURS} Stunden pro Woche.`,
    }, errors)
    const kilometres = readGoal(input.goals.distance, {
      key: 'distance',
      max: MAX_GOAL_KM,
      tooLarge: `Höchstens ${MAX_GOAL_KM} Kilometer pro Woche.`,
    }, errors)
    const elevation = readGoal(input.goals.elevation, {
      key: 'elevation',
      max: MAX_GOAL_ELEVATION_M,
      tooLarge: `Höchstens ${MAX_GOAL_ELEVATION_M} Höhenmeter pro Woche.`,
    }, errors)

    weeklyGoals = {
      durationSec: hours === null ? null : Math.round(hours * 3600),
      distanceM: kilometres === null ? null : Math.round(kilometres * 1000),
      elevationGainM: elevation === null ? null : Math.round(elevation),
    }
  }

  let maxHeartRate: number | null = null
  let ftpWatts: number | null = null
  if (input.zones !== undefined) {
    maxHeartRate = readBasis(input.zones.maxHeartRate, {
      key: 'maxHeartRate',
      min: MAX_HEART_RATE_MIN,
      max: MAX_HEART_RATE_MAX,
      outOfRange: `Maximalpuls muss zwischen ${MAX_HEART_RATE_MIN} und ${MAX_HEART_RATE_MAX} bpm liegen.`,
    }, errors)
    ftpWatts = readBasis(input.zones.ftpWatts, {
      key: 'ftpWatts',
      min: FTP_MIN,
      max: FTP_MAX,
      outOfRange: `FTP muss zwischen ${FTP_MIN} und ${FTP_MAX} W liegen.`,
    }, errors)
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: 'Bitte die markierten Felder prüfen.', errors }
  }

  const repository = getRepository()
  const current = await repository.getSettings()

  const next: UserSettings = {
    ...current,
    weeklyGoals: weeklyGoals ?? current.weeklyGoals,
    heartRateZones:
      maxHeartRate === null ? current.heartRateZones : buildHeartRateZones(maxHeartRate),
    powerZones: ftpWatts === null ? current.powerZones : buildPowerZones(ftpWatts),
  }

  await repository.saveSettings(next)

  // The dashboard reads the goals and the zone sets, so it has to refetch.
  revalidatePath('/')
  revalidatePath('/einstellungen')

  return { ok: true, message: 'Änderungen gespeichert.' }
}

// ── Datenquellen ───────────────────────────────────────────────────────────
//
// Connecting is a redirect (a link to /api/auth/<provider>), so it needs no
// action. Syncing and disconnecting do: both write on the server and both have
// to invalidate the pages that read the records afterwards.

/** One provider's outcome, already carrying its German label for the UI. */
export interface SyncResultRow {
  provider: ProviderId
  label: string
  status: 'succeeded' | 'failed' | 'skipped'
  counts: {
    activities: number
    dailyHealth: number
    sleep: number
    recovery: number
  }
  /** German sentence for a failed or skipped run, null on success. */
  error: string | null
}

export type SyncActionResult =
  | { ok: true; rows: SyncResultRow[] }
  | { ok: false; message: string }

export type DisconnectActionResult = { ok: boolean; message: string }

/**
 * A server action is a public endpoint, so the provider id is validated here
 * rather than trusted from the caller. Only providers with an adapter can run.
 */
function parseProvider(value: unknown): ProviderId | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getAdapter(value) === null ? null : value
}

function toRow(outcome: SyncOutcome): SyncResultRow {
  return {
    provider: outcome.provider,
    label: getProviderLabel(outcome.provider),
    status: outcome.status,
    counts: { ...outcome.counts },
    error: outcome.error,
  }
}

/** Records live under every page, so a run that wrote anything invalidates both. */
function revalidateAfterStoreWrite(): void {
  revalidatePath('/einstellungen')
  revalidatePath('/')
}

/**
 * Runs one provider, or every connected provider when none is named. A run that
 * started and failed is `ok: true` with a failed row — the user asked for a
 * sync and got one; only an impossible request is `ok: false`.
 */
export async function runSyncAction(provider?: ProviderId): Promise<SyncActionResult> {
  let outcomes: SyncOutcome[]

  if (provider === undefined) {
    const states = await connectionStates()
    if (!Object.values(states).some((state) => state?.connected === true)) {
      return {
        ok: false,
        message: 'Es ist keine Datenquelle verbunden. Bitte zuerst WHOOP oder Wahoo verbinden.',
      }
    }
    outcomes = await syncAllConnected()
  } else {
    const target = parseProvider(provider)
    if (target === null) {
      return { ok: false, message: 'Diese Datenquelle lässt sich nicht synchronisieren.' }
    }
    if (!(await isConnected(target))) {
      return {
        ok: false,
        message: `${getProviderLabel(target)} ist nicht verbunden. Bitte zuerst verbinden.`,
      }
    }
    outcomes = [await syncProvider(target)]
  }

  revalidateAfterStoreWrite()

  return { ok: true, rows: outcomes.map(toRow) }
}

/**
 * Disconnecting drops the tokens and every record that provider delivered.
 * Keeping the rows would keep showing data the user believes they revoked.
 */
export async function disconnectAction(provider: ProviderId): Promise<DisconnectActionResult> {
  const target = parseProvider(provider)
  if (target === null) {
    return { ok: false, message: 'Diese Datenquelle lässt sich nicht trennen.' }
  }

  const label = getProviderLabel(target)
  await clearConnection(target)
  const removed = await deleteByProvider(target)

  revalidateAfterStoreWrite()

  if (removed === 0) {
    return { ok: true, message: `${label} wurde getrennt. Es waren keine Daten gespeichert.` }
  }
  const records = removed === 1 ? '1 Datensatz' : `${String(removed)} Datensätze`
  return { ok: true, message: `${label} wurde getrennt, ${records} wurden gelöscht.` }
}
