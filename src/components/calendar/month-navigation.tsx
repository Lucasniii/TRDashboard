'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'

import { MONTH_PARAM, formatMonthLabel, shiftMonth } from '@/components/calendar/calendar-model'
import { cn } from '@/lib/cn'

/**
 * Month switch for the calendar. The state is the URL — every control is a real
 * link to `?monat=YYYY-MM`, so the page stays a server component, the browser
 * back button works, and a shared link opens the same month. The component is
 * a client component only so the label can announce itself politely after a
 * client-side navigation.
 */

const CONTROL =
  'flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1'

export interface MonthNavigationProps {
  /** Shown month, YYYY-MM. */
  monthKey: string
  /** Month the server considers "today", to decide whether "Heute" is useful. */
  todayMonthKey: string
  className?: string
}

function href(monthKey: string): string {
  return `/kalender?${MONTH_PARAM}=${monthKey}`
}

export function MonthNavigation({
  monthKey,
  todayMonthKey,
  className,
}: MonthNavigationProps): ReactElement {
  const previous = shiftMonth(monthKey, -1)
  const next = shiftMonth(monthKey, 1)
  const isCurrentMonth = monthKey === todayMonthKey

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <nav
        aria-label="Monat wechseln"
        className="flex items-center gap-1 rounded-lg border border-border-hair bg-surface p-1"
      >
        <Link
          href={href(previous)}
          aria-label={`Vorheriger Monat: ${formatMonthLabel(previous)}`}
          title={formatMonthLabel(previous)}
          className={CONTROL}
        >
          <span aria-hidden="true">◀</span>
        </Link>

        <span
          aria-live="polite"
          className="min-w-[8.5rem] px-1 text-center text-sm font-medium text-ink"
        >
          {formatMonthLabel(monthKey)}
        </span>

        <Link
          href={href(next)}
          aria-label={`Nächster Monat: ${formatMonthLabel(next)}`}
          title={formatMonthLabel(next)}
          className={CONTROL}
        >
          <span aria-hidden="true">▶</span>
        </Link>
      </nav>

      {isCurrentMonth ? null : (
        <Link
          href={href(todayMonthKey)}
          className="rounded-lg border border-border-hair bg-surface px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
        >
          Heute
        </Link>
      )}
    </div>
  )
}
