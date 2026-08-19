import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import { CalendarLegend } from '@/components/calendar/calendar-legend'
import {
  MONTH_PARAM,
  buildCalendarWeeks,
  calendarGridRange,
  formatMonthLabel,
  monthKeyRange,
  resolveMonthKey,
  toMonthKey,
} from '@/components/calendar/calendar-model'
import { MonthGrid } from '@/components/calendar/month-grid'
import { MonthNavigation } from '@/components/calendar/month-navigation'
import { PageHeader } from '@/components/ui/section'
import { EMPTY_NO_ACTIVITIES } from '@/components/ui/empty-state'
import { summarizeWeek } from '@/lib/analytics/weekly'
import { getRepository } from '@/lib/data'
import type { ActivityType } from '@/lib/domain/types'
import { formatDistance, formatDuration, formatElevation } from '@/lib/format'

export const metadata: Metadata = {
  title: 'Kalender · strwo',
}

interface KalenderPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function summaryLine(count: number, durationSec: number, distanceM: number, elevationM: number): string {
  if (count === 0) return EMPTY_NO_ACTIVITIES
  const label = count === 1 ? 'Aktivität' : 'Aktivitäten'
  return [
    `${count} ${label}`,
    formatDuration(durationSec),
    formatDistance(distanceM),
    formatElevation(elevationM),
  ].join(' · ')
}

export default async function KalenderPage({
  searchParams,
}: KalenderPageProps): Promise<ReactElement> {
  // Next 16 hands searchParams over as a promise; the month is the only state
  // this page has, and it lives in the URL.
  const params = await searchParams
  const today = new Date()
  const monthKey = resolveMonthKey(params[MONTH_PARAM], today)

  const gridRange = calendarGridRange(monthKey)
  const repository = getRepository()
  const [activities, recovery] = await Promise.all([
    repository.getActivities(gridRange),
    repository.getRecoveryMetrics(gridRange),
  ])

  const weeks = buildCalendarWeeks({ monthKey, range: gridRange, activities, recovery, today })
  // Totals cover the month itself, not the leading and trailing grid days.
  const month = summarizeWeek(activities, monthKeyRange(monthKey))

  const typesInMonth: ActivityType[] = []
  let hasRecovery = false
  for (const week of weeks) {
    for (const day of week) {
      if (!day.inMonth) continue
      if (day.recoveryScore !== null) hasRecovery = true
      for (const type of day.types) {
        if (!typesInMonth.includes(type)) typesInMonth.push(type)
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kalender"
        subline={summaryLine(
          month.activityCount,
          month.durationSec,
          month.distanceM,
          month.elevationGainM,
        )}
        action={<MonthNavigation monthKey={monthKey} todayMonthKey={toMonthKey(today)} />}
      />

      <section aria-label={`Kalender ${formatMonthLabel(monthKey)}`} className="flex flex-col gap-4">
        <MonthGrid weeks={weeks} monthKey={monthKey} />
        <CalendarLegend types={typesInMonth} hasRecovery={hasRecovery} />
      </section>
    </div>
  )
}
