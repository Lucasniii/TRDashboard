import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import { LoadPanel } from '@/components/training/load-panel'
import { WeeklyOverview } from '@/components/training/weekly-overview'
import { ZonePanel } from '@/components/training/zone-panel'
import {
  OVERVIEW_WEEKS,
  buildLoadSeries,
  buildWeekRows,
  buildZoneComparisons,
  loadKindLabel,
  trainingPageRange,
} from '@/components/training/data'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/section'
import { requireDashboardUserId } from '@/lib/auth/require-dashboard-user'
import { IS_MOCK_DATA, getRepository } from '@/lib/data'
import { fromDayKey, lastWeekRanges } from '@/lib/date'
import { formatDateRangeLabel, formatNumber } from '@/lib/format'

/**
 * Reads the record store, which a sync rewrites at runtime. Prerendering it
 * would freeze yesterday's numbers into the build.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Training · TRDashboard',
  description: 'Wochenübersicht, Trainingsbelastung und Zonenverteilung',
}

/**
 * Server component: one repository read, all aggregation on the server, and
 * three client panels that only switch between the results they were handed.
 */
export default async function TrainingPage(): Promise<ReactElement> {
  const repository = getRepository(await requireDashboardUserId())
  const today = new Date()
  const range = trainingPageRange(today)

  const [settings, activities, earliestRecord] = await Promise.all([
    repository.getSettings(),
    repository.getActivities(range),
    repository.getEarliestRecordDate(),
  ])

  const weekRows = buildWeekRows(activities, today)
  const loadPoints = buildLoadSeries(activities, today, earliestRecord)
  const kindLabel = loadKindLabel(activities)
  const zoneComparisons = buildZoneComparisons(activities, settings, today)

  const overviewRanges = lastWeekRanges(today, OVERVIEW_WEEKS)
  const firstWeek = overviewRanges[0]
  const subline =
    firstWeek === undefined
      ? undefined
      : `Letzte ${formatNumber(OVERVIEW_WEEKS)} Wochen · ${formatDateRangeLabel(
          fromDayKey(firstWeek.from),
          today,
        )}`

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Training"
        {...(subline === undefined ? {} : { subline })}
        {...(IS_MOCK_DATA ? { action: <Badge tone="warning">Demodaten</Badge> } : {})}
      />

      <WeeklyOverview rows={weekRows} loadKindLabel={kindLabel} />

      <LoadPanel points={loadPoints} loadKindLabel={kindLabel} />

      <ZonePanel comparisons={zoneComparisons} />
    </div>
  )
}
