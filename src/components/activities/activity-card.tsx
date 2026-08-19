import Link from 'next/link'
import type { ReactElement } from 'react'

import { ACTIVITY_TYPE_LABELS } from '@/components/activities/activity-type'
import { cardMetrics } from '@/components/activities/metrics'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Activity } from '@/lib/domain/types'
import { formatDateTime } from '@/lib/format'

/**
 * One activity in the feed. The whole card is the link — a card with a link
 * somewhere inside it makes people aim, and there is only one destination here.
 * The metric row lists what the activity actually carries; a missing value is
 * left out rather than repeated as a placeholder nine times over.
 */

export interface ActivityCardProps {
  activity: Activity
}

export function ActivityCard({ activity }: ActivityCardProps): ReactElement {
  const metrics = cardMetrics(activity)

  return (
    <Link
      href={`/aktivitaeten/${encodeURIComponent(activity.id)}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-plane"
    >
      <Card className="transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight text-ink">
              {activity.name}
            </h3>
            <p className="mt-1 text-sm text-ink-secondary">{formatDateTime(activity.startedAt)}</p>
          </div>
          <Badge>{ACTIVITY_TYPE_LABELS[activity.type]}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.key} className="min-w-0">
              <dt className="truncate text-xs text-ink-muted" title={metric.label}>
                {metric.label}
              </dt>
              <dd className="tabular mt-0.5 truncate text-sm font-medium text-ink">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </Link>
  )
}
