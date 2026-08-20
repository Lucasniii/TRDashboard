import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import { ActivityList } from '@/components/activities/activity-list'
import { PageHeader } from '@/components/ui/section'
import { requireDashboardUserId } from '@/lib/auth/require-dashboard-user'
import { getRepository } from '@/lib/data'
import { addDays, toDayKey } from '@/lib/date'

/**
 * The activity feed. The server loads the full history once and the filter row
 * narrows it on the client, so switching sport or period never waits on a
 * request. Grouping, totals and formatting all happen against the same list.
 */

/**
 * Reads the record store, which a sync rewrites at runtime. Prerendering it
 * would freeze yesterday's numbers into the build.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Aktivitäten · TRDashboard',
}

export default async function ActivitiesPage(): Promise<ReactElement> {
  const repository = getRepository(await requireDashboardUserId())
  const today = new Date()
  const todayKey = toDayKey(today)

  const earliest = await repository.getEarliestRecordDate()
  // Half-open range: `to` is tomorrow, so today's activities are included.
  const activities = await repository.getActivities({
    from: earliest ?? toDayKey(addDays(today, -364)),
    to: toDayKey(addDays(today, 1)),
  })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Aktivitäten"
        subline="Alle aufgezeichneten Einheiten, nach Kalenderwoche gruppiert"
      />

      <ActivityList activities={activities} todayKey={todayKey} earliest={earliest} />
    </div>
  )
}
