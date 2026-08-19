import type { TrainingZoneSet, ZoneBoundary } from '@/lib/domain/types'

/**
 * Zone boundaries derived from the two numbers the user actually knows: their
 * maximum heart rate and their FTP. Pure functions with no I/O, so the settings
 * form can preview a change in the browser and the server action can persist
 * exactly the same result.
 *
 * Heart rate — percentage of maximum heart rate:
 *   Zone 1  50–60 %   Zone 2  60–70 %   Zone 3  70–80 %
 *   Zone 4  80–90 %   Zone 5  90–100 % (open at the top)
 *
 * Power — percentage of FTP (classic Coggan splits):
 *   Zone 1  bis 55 %  Zone 2  56–75 %   Zone 3  76–90 %
 *   Zone 4  91–105 %  Zone 5  ab 106 % (open at the top)
 *
 * The upper bound of a zone is the next zone's lower bound minus one, and zone
 * 5 has no upper bound at all — matching `ZoneBoundary.max: number | null`.
 */

const HEART_RATE_FRACTIONS = [0.5, 0.6, 0.7, 0.8, 0.9] as const
const POWER_FRACTIONS = [0, 0.56, 0.76, 0.91, 1.06] as const

export const HEART_RATE_ZONE_LABELS = [
  'Regeneration',
  'Grundlagenausdauer 1',
  'Grundlagenausdauer 2',
  'Entwicklungsbereich',
  'Spitzenbereich',
] as const

export const POWER_ZONE_LABELS = [
  'Regeneration',
  'Grundlagenausdauer',
  'Tempo',
  'Schwelle',
  'Spitzenbereich',
] as const

/** The percentage band each zone covers, for the table's second column. */
export const HEART_RATE_PERCENT_LABELS = [
  '50–60 %',
  '60–70 %',
  '70–80 %',
  '80–90 %',
  'ab 90 %',
] as const

export const POWER_PERCENT_LABELS = [
  'bis 55 %',
  '56–75 %',
  '76–90 %',
  '91–105 %',
  'ab 106 %',
] as const

/** Plausibility bounds — a value outside these is a typo, not a training basis. */
export const MAX_HEART_RATE_MIN = 120
export const MAX_HEART_RATE_MAX = 230
export const FTP_MIN = 50
export const FTP_MAX = 600

const ZONE_NUMBERS = [1, 2, 3, 4, 5] as const

function zoneNumber(index: number): 1 | 2 | 3 | 4 | 5 {
  return ZONE_NUMBERS[index] ?? 1
}

function buildBoundaries(
  basis: number,
  fractions: readonly [number, number, number, number, number],
  labels: readonly [string, string, string, string, string],
): ZoneBoundary[] {
  const cuts = fractions.map((fraction) => Math.round(basis * fraction))
  const boundaries: ZoneBoundary[] = []
  for (let index = 0; index < 5; index += 1) {
    const min = cuts[index] ?? 0
    const nextMin = cuts[index + 1]
    boundaries.push({
      zone: zoneNumber(index),
      label: labels[index] ?? '',
      min,
      max: nextMin === undefined ? null : nextMin - 1,
    })
  }
  return boundaries
}

export function buildHeartRateZones(maxHeartRate: number): TrainingZoneSet {
  return {
    kind: 'heart_rate',
    boundaries: buildBoundaries(maxHeartRate, HEART_RATE_FRACTIONS, HEART_RATE_ZONE_LABELS),
    maxHeartRate,
  }
}

export function buildPowerZones(ftpWatts: number): TrainingZoneSet {
  return {
    kind: 'power',
    boundaries: buildBoundaries(ftpWatts, POWER_FRACTIONS, POWER_ZONE_LABELS),
    ftpWatts,
  }
}
