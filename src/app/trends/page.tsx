import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import { buildTrendDataset } from '@/components/trends/trend-dataset'
import { TrendsExplorer } from '@/components/trends/trends-explorer'
import { getRepository } from '@/lib/data'
import { periodToRange, toDayKey } from '@/lib/date'

/**
 * Reads the record store, which a sync rewrites at runtime. Prerendering it
 * would freeze yesterday's numbers into the build.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Trends · TRDashboard',
  description: 'Training und Gesundheit über eine gemeinsame Zeitachse',
}

/**
 * The page reads the full history once and hands the client one compact table.
 * Period and metric selection are then pure redraws of data that is already
 * there — no round trip, and no second reading of the same records.
 */
export default async function TrendsPage(): Promise<ReactElement> {
  const repository = getRepository()
  const today = new Date()

  const earliest = await repository.getEarliestRecordDate()
  const range = periodToRange('all', today, earliest)

  const [activities, daily, sleep, recovery] = await Promise.all([
    repository.getActivities(range),
    repository.getDailyHealth(range),
    repository.getSleepSessions(range),
    repository.getRecoveryMetrics(range),
  ])

  const dataset = buildTrendDataset({
    activities,
    daily,
    sleep,
    recovery,
    range,
    todayKey: toDayKey(today),
    earliest,
  })

  return <TrendsExplorer dataset={dataset} />
}
