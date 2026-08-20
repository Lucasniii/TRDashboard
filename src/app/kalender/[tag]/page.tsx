import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'

import { MONTH_PARAM, resolveMonthKey } from '@/components/calendar/calendar-model'
import { DayHealthCard } from '@/components/calendar/day-health-card'
import { DayTrainingCard } from '@/components/calendar/day-training-card'
import { PageHeader } from '@/components/ui/section'
import { requireDashboardUserId } from '@/lib/auth/require-dashboard-user'
import { addDays, fromDayKey, toDayKey } from '@/lib/date'
import { getRepository } from '@/lib/data'
import type { DateRange } from '@/lib/domain/types'
import { formatDateLong, formatWeekdayLong } from '@/lib/format'

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A key is valid only if it survives the round trip — "2026-02-31" does not. */
function isDayKey(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false
  return toDayKey(fromDayKey(value)) === value
}

function dayRange(dayKey: string): DateRange {
  return { from: dayKey, to: toDayKey(addDays(fromDayKey(dayKey), 1)) }
}

interface DayPageProps {
  params: Promise<{ tag: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: DayPageProps): Promise<Metadata> {
  const { tag } = await params
  if (!isDayKey(tag)) return { title: 'Kalender · TRDashboard' }
  return { title: `${formatDateLong(tag)} · Kalender · TRDashboard` }
}

export default async function KalenderTagPage({
  params,
  searchParams,
}: DayPageProps): Promise<ReactElement> {
  // Both params and searchParams arrive as promises in Next 16.
  const [{ tag }, query] = await Promise.all([params, searchParams])
  if (!isDayKey(tag)) notFound()

  const range = dayRange(tag)
  const repository = getRepository(await requireDashboardUserId())
  const [activities, daily, sleep, recovery] = await Promise.all([
    repository.getActivities(range),
    repository.getDailyHealth(range),
    repository.getSleepSessions(range),
    repository.getRecoveryMetrics(range),
  ])

  // Return to the month the user came from; the day's own month is the fallback.
  const backMonth = resolveMonthKey(query[MONTH_PARAM], fromDayKey(tag))

  const ordered = [...activities].sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/kalender?${MONTH_PARAM}=${backMonth}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
      >
        <span aria-hidden="true">←</span>
        Zurück zum Kalender
      </Link>

      <PageHeader title={formatDateLong(tag)} subline={formatWeekdayLong(tag)} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <DayTrainingCard activities={ordered} />
        <DayHealthCard
          health={daily[0] ?? null}
          sleep={sleep[0] ?? null}
          recovery={recovery[0] ?? null}
        />
      </div>
    </div>
  )
}
