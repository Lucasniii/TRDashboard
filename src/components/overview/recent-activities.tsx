import Link from 'next/link'
import type { ReactElement } from 'react'

import { EMPTY_NO_ACTIVITIES, EmptyState } from '@/components/ui/empty-state'
import { SectionHeading } from '@/components/ui/section'
import type { Activity } from '@/lib/domain/types'
import { formatDateTime, formatDistance, formatDuration } from '@/lib/format'
import { ACTIVITY_TYPE_LABELS } from '@/lib/providers/mapping'

/**
 * The last few sessions as one-line rows. Deliberately compact: type, time and
 * the two numbers every sport has. An activity without distance (Krafttraining)
 * reads "keine Daten" in that column rather than a zero.
 */

const LINK_CLASSES =
  '-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1'

export interface RecentActivitiesProps {
  activities: readonly Activity[]
}

export function RecentActivities({ activities }: RecentActivitiesProps): ReactElement {
  return (
    <section aria-labelledby="letzte-aktivitaeten-titel">
      <SectionHeading
        id="letzte-aktivitaeten-titel"
        title="Letzte Aktivitäten"
        action={
          <Link
            href="/aktivitaeten"
            className="rounded-md text-sm text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-series-1"
          >
            Alle Aktivitäten
          </Link>
        }
      />

      {activities.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={EMPTY_NO_ACTIVITIES}
          description="Sobald eine Aktivität synchronisiert wurde, erscheint sie hier"
        />
      ) : (
        <ul className="mt-2 divide-y divide-border-hair">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link href={`/aktivitaeten/${activity.id}`} className={LINK_CLASSES}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {activity.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {ACTIVITY_TYPE_LABELS[activity.type]} · {formatDateTime(activity.startedAt)}
                  </span>
                </span>

                <span className="flex shrink-0 items-baseline gap-4 text-sm">
                  <span
                    className={`tabular hidden w-24 text-right sm:block ${
                      activity.distanceM === null ? 'text-ink-muted' : 'text-ink'
                    }`}
                  >
                    {formatDistance(activity.distanceM)}
                  </span>
                  <span className="tabular w-20 text-right text-ink-secondary">
                    {formatDuration(activity.durationSec)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
