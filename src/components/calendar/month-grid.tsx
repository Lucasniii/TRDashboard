import Link from 'next/link'
import type { ReactElement } from 'react'

import {
  ACTIVITY_TYPE_DOT_CLASSES,
  ACTIVITY_TYPE_LABELS,
  MONTH_PARAM,
  WEEKDAY_HEADERS,
  formatMonthLabel,
  type CalendarDay,
  type CalendarWeek,
} from '@/components/calendar/calendar-model'
import { cn } from '@/lib/cn'
import {
  formatDateLong,
  formatDuration,
  formatDurationClock,
  formatPercent,
  formatWeekdayLong,
} from '@/lib/format'

/**
 * The month as a real table: weekday columns, one row per week. Every cell is a
 * link to the day detail, and the cell's accessible name carries in words what
 * the dots and the bar show visually.
 *
 * At 375px the cells shrink but keep their three signals — day number, activity
 * dots, training time — because those are the reason to look at the grid.
 */

const WEEKDAY_NAMES = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const

/** The bar is a share of the maximum possible score. */
const RECOVERY_MAX = 100

function recoveryReadout(score: number): string {
  return `Erholung: ${formatPercent(Math.round(score))}`
}

function cellLabel(day: CalendarDay): string {
  const parts: string[] = [`${formatWeekdayLong(day.date)}, ${formatDateLong(day.date)}`]

  if (day.activityCount === 0) {
    parts.push('keine Aktivitäten')
  } else {
    const types = day.types.map((type) => ACTIVITY_TYPE_LABELS[type]).join(', ')
    parts.push(
      `${day.activityCount} ${day.activityCount === 1 ? 'Aktivität' : 'Aktivitäten'}${
        types === '' ? '' : ` (${types})`
      }`,
    )
    parts.push(`Trainingszeit ${formatDuration(day.durationSec)}`)
  }

  if (day.recoveryScore !== null) parts.push(recoveryReadout(day.recoveryScore))
  if (day.isToday) parts.push('heute')

  return parts.join(', ')
}

function DayCell({ day, monthKey }: { day: CalendarDay; monthKey: string }): ReactElement {
  const hasTraining = day.activityCount > 0
  const isQuiet = !hasTraining && day.recoveryScore === null

  return (
    <Link
      href={`/kalender/${day.date}?${MONTH_PARAM}=${monthKey}`}
      aria-label={cellLabel(day)}
      aria-current={day.isToday ? 'date' : undefined}
      className={cn(
        'flex min-h-[4.75rem] w-full flex-col gap-1 p-1 transition-colors sm:min-h-[6.5rem] sm:gap-1.5 sm:p-2',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-series-1',
        day.inMonth ? 'bg-surface' : 'bg-surface opacity-50',
        day.isToday ? 'ring-1 ring-inset ring-series-1' : null,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'text-xs font-medium tabular sm:text-sm',
          day.isToday ? 'text-series-1' : isQuiet ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {day.dayNumber}
      </span>

      {day.types.length === 0 ? null : (
        <span aria-hidden="true" className="flex flex-wrap items-center gap-0.5">
          {day.types.map((type) => (
            <span
              key={type}
              title={ACTIVITY_TYPE_LABELS[type]}
              className={cn('h-1.5 w-1.5 rounded-full', ACTIVITY_TYPE_DOT_CLASSES[type])}
            />
          ))}
        </span>
      )}

      <span className="mt-auto flex flex-col gap-1">
        {hasTraining ? (
          <span aria-hidden="true" className="text-[11px] leading-none tabular text-ink-secondary">
            {/* Long form where it fits, clock form in a 46px cell on a 375px screen. */}
            <span className="sm:hidden">{formatDurationClock(day.durationSec)} h</span>
            <span className="hidden sm:inline">{formatDuration(day.durationSec)}</span>
          </span>
        ) : null}

        {day.recoveryScore === null ? null : (
          <span
            title={recoveryReadout(day.recoveryScore)}
            className="block h-1 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <span
              aria-hidden="true"
              className="block h-full rounded-full bg-series-3"
              style={{
                width: `${Math.min(100, Math.max(0, (day.recoveryScore / RECOVERY_MAX) * 100))}%`,
              }}
            />
          </span>
        )}
      </span>
    </Link>
  )
}

export interface MonthGridProps {
  weeks: CalendarWeek[]
  monthKey: string
  className?: string
}

export function MonthGrid({ weeks, monthKey, className }: MonthGridProps): ReactElement {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border-hair', className)}>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          Trainingskalender {formatMonthLabel(monthKey)}. Jeder Tag führt zur Tagesansicht.
        </caption>
        <thead>
          <tr>
            {WEEKDAY_HEADERS.map((header, index) => (
              <th
                key={header}
                scope="col"
                className="border-b border-l border-border-hair bg-surface-2 px-1 py-2 text-center text-xs font-medium text-ink-secondary first:border-l-0"
              >
                <span aria-hidden="true">{header}</span>
                <span className="sr-only">{WEEKDAY_NAMES[index]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.date ?? monthKey}>
              {week.map((day) => (
                <td
                  key={day.date}
                  className="border-t border-l border-border-hair p-0 align-top first:border-l-0"
                >
                  <DayCell day={day} monthKey={monthKey} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
