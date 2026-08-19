import type { ReactElement } from 'react'

import type { MetricEntry } from '@/components/activities/metrics'
import { NO_DATA } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The detail page's inventory of headline numbers. Unlike the feed card this
 * grid is complete: a metric the source never delivered keeps its slot and
 * reads "keine Daten", so a gap stays visible instead of quietly disappearing.
 */

export interface ActivityMetricGridProps {
  metrics: readonly MetricEntry[]
  className?: string
}

export function ActivityMetricGrid({ metrics, className }: ActivityMetricGridProps): ReactElement {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
    >
      {metrics.map((metric) => {
        const hasValue = metric.value !== null
        return (
          <div key={metric.key} className="flex min-w-0 flex-col gap-1">
            <dt className="truncate text-xs font-medium uppercase tracking-wide text-ink-muted" title={metric.label}>
              {metric.label}
            </dt>
            <dd
              // Size and weight sit inside the branches: cn() only joins class
              // names, so two competing font sizes would be decided by the
              // stylesheet order rather than by this condition.
              className={cn(
                'tabular truncate tracking-tight',
                hasValue ? 'text-lg font-semibold text-ink' : 'text-sm font-medium text-ink-muted',
              )}
            >
              {metric.value ?? NO_DATA}
            </dd>
            {metric.hint === undefined || !hasValue ? null : (
              <p className="truncate text-xs text-ink-muted">{metric.hint}</p>
            )}
          </div>
        )
      })}
    </dl>
  )
}
