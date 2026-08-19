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
import type { UserSettings, WeeklyGoals } from '@/lib/domain/types'

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
