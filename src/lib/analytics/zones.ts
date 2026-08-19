import type { Activity, TrainingZoneSet, ZoneKind, ZoneSeconds } from '@/lib/domain/types'

/**
 * "Zeit in Trainingszonen". Zone seconds are taken as the provider reported
 * them — nothing is recomputed from averages, so an activity without zone data
 * simply contributes nothing.
 */

export interface ZoneSlice {
  zone: 1 | 2 | 3 | 4 | 5
  label: string
  seconds: number
  /** Share of totalSec in percent (0..100), 0 while there is no data. */
  share: number
}

export interface ZoneAggregate {
  kind: ZoneKind
  totalSec: number
  slices: ZoneSlice[]
  hasData: boolean
}

export const ZONE_NAMES: Record<ZoneKind, [string, string, string, string, string]> = {
  heart_rate: [
    'Zone 1 · Regeneration',
    'Zone 2 · Grundlage',
    'Zone 3 · Tempo',
    'Zone 4 · Schwelle',
    'Zone 5 · Maximal',
  ],
  power: [
    'Zone 1 · Aktive Erholung',
    'Zone 2 · Grundlage',
    'Zone 3 · Tempo',
    'Zone 4 · Schwelle',
    'Zone 5 · VO2max',
  ],
}

/** Literal indices keep tuple access exact under noUncheckedIndexedAccess. */
const ZONE_INDICES = [0, 1, 2, 3, 4] as const
const ZONE_NUMBERS = [1, 2, 3, 4, 5] as const

function seriesFor(activity: Activity, kind: ZoneKind): ZoneSeconds | null {
  return kind === 'power' ? activity.powerZoneSec : activity.hrZoneSec
}

export function aggregateZones(
  activities: Activity[],
  kind: ZoneKind,
  zones: TrainingZoneSet,
): ZoneAggregate {
  const totals: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  let totalSec = 0

  for (const activity of activities) {
    const series = seriesFor(activity, kind)
    if (!series) continue
    for (let i = 0; i < 5; i += 1) {
      const seconds = series[i] ?? 0
      totals[i] = (totals[i] ?? 0) + seconds
      totalSec += seconds
    }
  }

  const names = ZONE_NAMES[kind]
  const slices: ZoneSlice[] = ZONE_INDICES.map((index) => {
    const zone = ZONE_NUMBERS[index]
    const seconds = totals[index]
    // A user-configured zone name wins over the generic default.
    const boundaryLabel = zones.boundaries.find((entry) => entry.zone === zone)?.label
    return {
      zone,
      label: boundaryLabel && boundaryLabel.trim() !== '' ? boundaryLabel : names[index],
      seconds,
      share: totalSec > 0 ? (seconds / totalSec) * 100 : 0,
    }
  })

  return { kind, totalSec, slices, hasData: totalSec > 0 }
}
