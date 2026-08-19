import Link from 'next/link'
import type { ReactElement } from 'react'

import { ACTIVITY_TYPE_LABELS } from '@/components/calendar/calendar-model'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { Activity } from '@/lib/domain/types'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatTime,
} from '@/lib/format'

/**
 * Every activity filed under one day. The numbers come straight from the
 * activity record — a session without distance (Krafttraining) or without a
 * provider load simply reads "keine Daten" in that column.
 */

interface MetricProps {
  label: string
  value: string
}

function Metric({ label, value }: MetricProps): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="truncate text-sm tabular text-ink">{value}</dd>
    </div>
  )
}

export interface DayTrainingCardProps {
  activities: Activity[]
}

export function DayTrainingCard({ activities }: DayTrainingCardProps): ReactElement {
  const totalSec = activities.reduce((sum, activity) => sum + activity.durationSec, 0)
  const hint =
    activities.length === 0
      ? undefined
      : `${activities.length} ${activities.length === 1 ? 'Aktivität' : 'Aktivitäten'} · ${formatDuration(totalSec)}`

  return (
    <Card aria-labelledby="tag-training">
      <CardHeader id="tag-training" title="Training" hint={hint} />
      <CardBody>
        {activities.length === 0 ? (
          <EmptyState
            title="Keine Aktivitäten an diesem Tag"
            description="Für diesen Tag liegt keine aufgezeichnete Einheit vor."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {activities.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/aktivitaeten/${activity.id}`}
                  className="flex flex-col gap-3 rounded-lg border border-border-hair p-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {activity.name}
                    </span>
                    <span className="shrink-0 text-xs tabular text-ink-muted">
                      {formatTime(activity.startedAt)}
                    </span>
                  </div>

                  <div>
                    <Badge>{ACTIVITY_TYPE_LABELS[activity.type]}</Badge>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                    <Metric label="Dauer" value={formatDuration(activity.durationSec)} />
                    <Metric label="Distanz" value={formatDistance(activity.distanceM)} />
                    <Metric label="Höhenmeter" value={formatElevation(activity.elevationGainM)} />
                    <Metric
                      label="Trainingsbelastung"
                      value={formatNumber(activity.trainingLoad, 1)}
                    />
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
