import type { SegmentedOption } from '@/components/ui/segmented-control'
import type { ActivityType } from '@/lib/domain/types'

/**
 * The German name of every activity type, in one place. The filter row, the
 * feed cards and the detail header all read from here, so a sport can never be
 * called two different things in two parts of the app.
 */

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  ride: 'Radfahren',
  indoor_ride: 'Indoor Cycling',
  run: 'Laufen',
  hike: 'Wandern',
  strength: 'Krafttraining',
  other: 'Sonstiges',
}

/** Display order of the sports — most frequent first, "Sonstiges" last. */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  'ride',
  'indoor_ride',
  'run',
  'hike',
  'strength',
  'other',
]

/** 'all' is the unfiltered feed, not a sixth sport. */
export type ActivityTypeFilter = ActivityType | 'all'

export const ACTIVITY_TYPE_FILTER_OPTIONS: readonly SegmentedOption<ActivityTypeFilter>[] = [
  { value: 'all', label: 'Alle' },
  ...ACTIVITY_TYPE_ORDER.map((type) => ({ value: type, label: ACTIVITY_TYPE_LABELS[type] })),
]

export function matchesTypeFilter(type: ActivityType, filter: ActivityTypeFilter): boolean {
  return filter === 'all' || type === filter
}
