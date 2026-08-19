'use client'

import { useMemo, useState, type ReactElement } from 'react'

import { ActivityCard } from '@/components/activities/activity-card'
import {
  ACTIVITY_TYPE_FILTER_OPTIONS,
  matchesTypeFilter,
  type ActivityTypeFilter,
} from '@/components/activities/activity-type'
import { EmptyState, EMPTY_NO_ACTIVITIES } from '@/components/ui/empty-state'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control'
import { activityDayKey, summarizeWeek, type WeekSummary } from '@/lib/analytics/weekly'
import {
  PERIOD_LABELS,
  addDays,
  fromDayKey,
  isoWeekNumber,
  periodToRange,
  rangeContains,
  startOfWeek,
  toDayKey,
  type PeriodKey,
} from '@/lib/date'
import type { Activity } from '@/lib/domain/types'
import {
  formatDateRangeLabel,
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
} from '@/lib/format'

/**
 * The feed and its two filters. The server hands over every activity it has;
 * period and sport are narrowed here, so switching a filter is instant and
 * costs no round trip. Both filters work on the same list, and the week totals
 * always describe exactly the cards shown below them — never a hidden superset.
 */

const PERIOD_ORDER: readonly PeriodKey[] = ['7d', '30d', '3m', '6m', '1y', 'all']

const PERIOD_OPTIONS: readonly SegmentedOption<PeriodKey>[] = PERIOD_ORDER.map((period) => ({
  value: period,
  label: PERIOD_LABELS[period],
}))

const DEFAULT_PERIOD: PeriodKey = '30d'

interface WeekGroup {
  weekStart: string
  heading: string
  summary: WeekSummary
  activities: Activity[]
}

export interface ActivityListProps {
  /** Everything the repository holds; the filters narrow it down. */
  activities: Activity[]
  /** Today as a day key, so server and client agree on the period boundaries. */
  todayKey: string
  /** Earliest record in the store — bounds the "Gesamt" period. */
  earliest: string | null
}

/** "3 Aktivitäten · 4 h 20 min · 112 km · 1.240 m" — zeros are left out. */
function summaryLine(summary: WeekSummary): string {
  const parts: string[] = [
    summary.activityCount === 1
      ? '1 Aktivität'
      : `${formatNumber(summary.activityCount)} Aktivitäten`,
    formatDuration(summary.durationSec),
  ]
  if (summary.distanceM > 0) parts.push(formatDistance(summary.distanceM))
  if (summary.elevationGainM > 0) parts.push(formatElevation(summary.elevationGainM))
  return parts.join(' · ')
}

/** "KW 34 · 11. – 17. August 2026" */
function weekHeading(weekStart: string): string {
  const start = fromDayKey(weekStart)
  const end = addDays(start, 6)
  return `KW ${formatNumber(isoWeekNumber(start))} · ${formatDateRangeLabel(start, end)}`
}

function groupByWeek(activities: Activity[]): WeekGroup[] {
  const buckets = new Map<string, Activity[]>()

  for (const activity of activities) {
    const weekStart = toDayKey(startOfWeek(fromDayKey(activityDayKey(activity))))
    const bucket = buckets.get(weekStart)
    if (bucket === undefined) buckets.set(weekStart, [activity])
    else bucket.push(activity)
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, weekActivities]) => {
      const sorted = [...weekActivities].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const range = {
        from: weekStart,
        to: toDayKey(addDays(fromDayKey(weekStart), 7)),
      }
      return {
        weekStart,
        heading: weekHeading(weekStart),
        summary: summarizeWeek(sorted, range),
        activities: sorted,
      }
    })
}

export function ActivityList({
  activities,
  todayKey,
  earliest,
}: ActivityListProps): ReactElement {
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD)
  const [type, setType] = useState<ActivityTypeFilter>('all')

  const { groups, total } = useMemo(() => {
    const range = periodToRange(period, fromDayKey(todayKey), earliest)
    const filtered = activities.filter(
      (activity) =>
        matchesTypeFilter(activity.type, type) &&
        rangeContains(range, activityDayKey(activity)),
    )
    return { groups: groupByWeek(filtered), total: summarizeWeek(filtered, range) }
  }, [activities, earliest, period, todayKey, type])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={ACTIVITY_TYPE_FILTER_OPTIONS}
          value={type}
          onChange={setType}
          label="Sportart"
          size="sm"
        />
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          label="Zeitraum"
          size="sm"
        />
      </div>

      {total.activityCount === 0 ? (
        <EmptyState
          title={EMPTY_NO_ACTIVITIES}
          description="Für den gewählten Zeitraum und die gewählte Sportart sind keine Einheiten aufgezeichnet."
          hint="Zeitraum erweitern oder die Sportart auf „Alle“ stellen."
        />
      ) : (
        <>
          <p className="tabular text-sm text-ink-secondary" aria-live="polite">
            {summaryLine(total)}
          </p>

          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <section
                key={group.weekStart}
                aria-labelledby={`kw-${group.weekStart}`}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-hair pb-2">
                  <h2
                    id={`kw-${group.weekStart}`}
                    className="text-sm font-semibold tracking-tight text-ink"
                  >
                    {group.heading}
                  </h2>
                  <p className="tabular text-xs text-ink-secondary">{summaryLine(group.summary)}</p>
                </div>

                <ul className="flex flex-col gap-3">
                  {group.activities.map((activity) => (
                    <li key={activity.id}>
                      <ActivityCard activity={activity} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
