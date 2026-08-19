import type { ReactElement } from 'react'

import {
  ACTIVITY_TYPE_DOT_CLASSES,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ORDER,
} from '@/components/calendar/calendar-model'
import type { ActivityType } from '@/lib/domain/types'
import { cn } from '@/lib/cn'

/**
 * Direct labels for the dot row. Only the types that actually occur in the
 * shown month are listed — a legend entry for a sport nobody did would suggest
 * data that is not there.
 */

export interface CalendarLegendProps {
  types: readonly ActivityType[]
  /** True when at least one day in the month carries a recovery score. */
  hasRecovery: boolean
  className?: string
}

export function CalendarLegend({
  types,
  hasRecovery,
  className,
}: CalendarLegendProps): ReactElement | null {
  const present = ACTIVITY_TYPE_ORDER.filter((type) => types.includes(type))
  if (present.length === 0 && !hasRecovery) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {present.map((type) => (
        <span key={type} className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span
            aria-hidden="true"
            className={cn('h-1.5 w-1.5 rounded-full', ACTIVITY_TYPE_DOT_CLASSES[type])}
          />
          {ACTIVITY_TYPE_LABELS[type]}
        </span>
      ))}

      {hasRecovery ? (
        <span className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <span
            aria-hidden="true"
            className="block h-1 w-6 overflow-hidden rounded-full bg-surface-2"
          >
            <span className="block h-full w-2/3 rounded-full bg-series-3" />
          </span>
          Erholung (Balkenbreite = Wert)
        </span>
      ) : null}
    </div>
  )
}
