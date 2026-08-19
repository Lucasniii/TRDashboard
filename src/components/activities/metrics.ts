import type { Activity } from '@/lib/domain/types'
import {
  formatCalories,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatNumber,
  formatPower,
  formatSpeed,
} from '@/lib/format'

/**
 * The metric readouts of one activity, formatted once and reused by the feed
 * card and the detail grid.
 *
 * A metric the provider never reported stays `null` here. The detail page shows
 * that as "keine Daten" because the grid is a complete inventory; the feed card
 * drops the entry entirely, since nine placeholders per card would say nothing.
 */

export type MetricKey =
  | 'duration'
  | 'distance'
  | 'elevation'
  | 'avgSpeed'
  | 'avgHeartRate'
  | 'maxHeartRate'
  | 'avgPower'
  | 'normalizedPower'
  | 'calories'
  | 'load'

export interface MetricEntry {
  key: MetricKey
  /** German metric name. */
  label: string
  /** Formatted for de-AT, or null when the activity carries no such value. */
  value: string | null
  /** Quiet provenance note, e.g. which load metric the provider reported. */
  hint?: string
}

/** A metric that is actually present — the card only ever renders these. */
export interface PresentMetricEntry extends MetricEntry {
  value: string
}

const LOAD_KIND_LABELS: Record<'whoop_strain' | 'tss' | 'trimp', string> = {
  whoop_strain: 'Whoop Strain',
  tss: 'TSS',
  trimp: 'TRIMP',
}

function formatted(value: number | null, format: (input: number) => string): string | null {
  return value === null || !Number.isFinite(value) ? null : format(value)
}

function buildMetrics(activity: Activity): Record<MetricKey, MetricEntry> {
  const loadKind = activity.trainingLoadKind
  const loadHint = loadKind === null ? undefined : LOAD_KIND_LABELS[loadKind]

  return {
    duration: {
      key: 'duration',
      label: 'Dauer',
      value: formatted(activity.durationSec, formatDuration),
    },
    distance: {
      key: 'distance',
      label: 'Distanz',
      value: formatted(activity.distanceM, (value) => formatDistance(value)),
    },
    elevation: {
      key: 'elevation',
      label: 'Höhenmeter',
      value: formatted(activity.elevationGainM, formatElevation),
    },
    avgSpeed: {
      key: 'avgSpeed',
      label: 'Ø Geschwindigkeit',
      value: formatted(activity.avgSpeedMps, formatSpeed),
    },
    avgHeartRate: {
      key: 'avgHeartRate',
      label: 'Ø Puls',
      value: formatted(activity.avgHeartRate, formatHeartRate),
    },
    maxHeartRate: {
      key: 'maxHeartRate',
      label: 'Max. Puls',
      value: formatted(activity.maxHeartRate, formatHeartRate),
    },
    avgPower: {
      key: 'avgPower',
      label: 'Ø Leistung',
      value: formatted(activity.avgPower, formatPower),
    },
    normalizedPower: {
      key: 'normalizedPower',
      label: 'Normalisierte Leistung',
      value: formatted(activity.normalizedPower, formatPower),
    },
    calories: {
      key: 'calories',
      label: 'Kalorien',
      value: formatted(activity.calories, formatCalories),
    },
    load: {
      key: 'load',
      label: 'Trainingsbelastung',
      value: formatted(activity.trainingLoad, (value) => formatNumber(value, 1)),
      ...(loadHint === undefined ? {} : { hint: loadHint }),
    },
  }
}

const CARD_ORDER: readonly MetricKey[] = [
  'duration',
  'distance',
  'elevation',
  'avgHeartRate',
  'avgPower',
  'normalizedPower',
  'calories',
  'load',
  'avgSpeed',
]

const DETAIL_ORDER: readonly MetricKey[] = [
  'duration',
  'distance',
  'elevation',
  'avgSpeed',
  'avgHeartRate',
  'maxHeartRate',
  'avgPower',
  'normalizedPower',
  'calories',
  'load',
]

/** Feed card: present metrics only. */
export function cardMetrics(activity: Activity): PresentMetricEntry[] {
  const all = buildMetrics(activity)
  const present: PresentMetricEntry[] = []
  for (const key of CARD_ORDER) {
    const entry = all[key]
    if (entry.value !== null) present.push({ ...entry, value: entry.value })
  }
  return present
}

/** Detail page: the full inventory, gaps included. */
export function detailMetrics(activity: Activity): MetricEntry[] {
  const all = buildMetrics(activity)
  return DETAIL_ORDER.map((key) => all[key])
}
