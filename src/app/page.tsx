import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactElement } from 'react'

import { Sparkline } from '@/components/charts/sparkline'
import { HrvPanel } from '@/components/overview/hrv-panel'
import { RecentActivities } from '@/components/overview/recent-activities'
import { RecoveryTile } from '@/components/overview/recovery-tile'
import { VolumePanel } from '@/components/overview/volume-panel'
import { WeekGoals } from '@/components/overview/week-goals'
import { ZonePanel } from '@/components/overview/zone-panel'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/section'
import { StatTile } from '@/components/ui/stat-tile'
import {
  activitiesInRange,
  aggregateZones,
  average,
  compare,
  deriveReadiness,
  goalProgress,
  metricSeries,
  metricTrend,
  recoverySeries,
  sleepSeries,
  summarizeWeek,
  weeklyVolume,
  type SeriesPoint,
} from '@/lib/analytics'
import { IS_MOCK_DATA, getRepository, isEmptyState } from '@/lib/data'
import { addDays, fromDayKey, lastWeekRanges, previousRange, toDayKey, weekRange } from '@/lib/date'
import type { Activity, DateRange } from '@/lib/domain/types'
import {
  NO_DATA,
  formatDateRangeLabel,
  formatDayMonth,
  formatDistance,
  formatDuration,
  formatDurationClock,
  formatElevation,
  formatHeartRate,
  formatHrv,
  formatKm,
  formatNumber,
} from '@/lib/format'

/**
 * Übersicht — the screen that has to answer six questions at a glance: how much
 * did I train this week, how far, how high, how was the intensity spread, where
 * is my HRV going, and how recovered am I.
 *
 * All reads happen here, in one server pass; the interactive panels below are
 * client components that only switch between values they were already handed.
 */

/**
 * Reads the record store, which a sync rewrites at runtime. Prerendering it
 * would freeze yesterday's numbers into the build.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Übersicht · strwo',
}

const HISTORY_WEEKS = 12
/** Wide enough for metricTrend's 60-day baseline to have room to breathe. */
const HEALTH_HISTORY_DAYS = 90
const HRV_CHART_DAYS = 30
const RECENT_ACTIVITY_COUNT = 4
/** Window the readiness estimate reads recent training load from. */
const RECENT_LOAD_DAYS = 7

/** Last day in the series that actually carries a measurement. */
function lastMeasured(points: readonly SeriesPoint[]): SeriesPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]
    if (point !== undefined && point.value !== null && Number.isFinite(point.value)) return point
  }
  return null
}

/** Formats a nullable metric, or returns null so StatTile can say "keine Daten". */
function tileValue(value: number | null, digits = 0): string | null {
  return value === null ? null : formatNumber(value, digits)
}

function byMostRecent(a: Activity, b: Activity): number {
  return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
}

export default async function OverviewPage(): Promise<ReactElement> {
  // Nothing synced yet: a wall of zeroes would read as "you trained nothing",
  // which is a different statement from "there is no data".
  if (isEmptyState()) {
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        <PageHeader title="Übersicht" />
        <Card>
          <div className="flex flex-col gap-3 p-1">
            <h2 className="text-base font-semibold text-ink">Noch keine Daten</h2>
            <p className="max-w-prose text-sm text-ink-secondary">
              Es wurde noch keine Datenquelle synchronisiert. Verbinde WHOOP oder Wahoo und starte
              den ersten Abgleich — danach stehen hier deine Wochenwerte, Trainingszonen und der
              HRV-Verlauf.
            </p>
            <Link
              href="/einstellungen"
              className="w-fit rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
            >
              Zu den Datenquellen
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const repository = getRepository()
  const today = new Date()
  const todayKey = toDayKey(today)

  const week = weekRange(today)
  const previousWeek = previousRange(week)
  const weeks = lastWeekRanges(today, HISTORY_WEEKS)
  const firstWeek = weeks[0]

  const activityRange: DateRange = { from: firstWeek?.from ?? previousWeek.from, to: week.to }
  const healthRange: DateRange = {
    from: toDayKey(addDays(today, -(HEALTH_HISTORY_DAYS - 1))),
    to: toDayKey(addDays(today, 1)),
  }
  const recentLoadRange: DateRange = {
    from: toDayKey(addDays(today, -(RECENT_LOAD_DAYS - 1))),
    to: toDayKey(addDays(today, 1)),
  }

  const [settings, activities, daily, sleep, recovery] = await Promise.all([
    repository.getSettings(),
    repository.getActivities(activityRange),
    repository.getDailyHealth(healthRange),
    repository.getSleepSessions(healthRange),
    repository.getRecoveryMetrics(healthRange),
  ])

  // ── training ───────────────────────────────────────────────────────────────

  const summary = summarizeWeek(activities, week)
  const previousSummary = summarizeWeek(activities, previousWeek)
  const weekSummaries = weeks.map((range) => summarizeWeek(activities, range))
  const volumePoints = weeklyVolume(activities, weeks, today)

  const distanceDelta = compare(summary.distanceM, previousSummary.distanceM)
  const durationDelta = compare(summary.durationSec, previousSummary.durationSec)
  const elevationDelta = compare(summary.elevationGainM, previousSummary.elevationGainM)
  const countDelta = compare(summary.activityCount, previousSummary.activityCount)

  const weekActivities = activitiesInRange(activities, week)
  const heartRateZones = aggregateZones(weekActivities, 'heart_rate', settings.heartRateZones)
  const powerZones = aggregateZones(weekActivities, 'power', settings.powerZones)

  const goals = goalProgress(summary, settings.weeklyGoals)
  const recentActivities = [...activities].sort(byMostRecent).slice(0, RECENT_ACTIVITY_COUNT)

  // ── health ─────────────────────────────────────────────────────────────────

  const hrvPoints = metricSeries(daily, 'hrvMs', healthRange)
  const restingPoints = metricSeries(daily, 'restingHeartRate', healthRange)
  const sleepPoints = sleepSeries(sleep, healthRange)
  const recoveryPoints = recoverySeries(recovery, healthRange)

  const hrvTrend = metricTrend(hrvPoints)
  const restingTrend = metricTrend(restingPoints)

  const lastSleep = lastMeasured(sleepPoints)
  const sleepAvg7 = average(sleepPoints.slice(-7))
  const providerRecovery = lastMeasured(recoveryPoints)?.value ?? null

  const readiness = deriveReadiness({
    hrv: hrvTrend,
    restingHr: restingTrend,
    sleepSec: lastSleep?.value ?? null,
    recentLoad: summarizeWeek(activities, recentLoadRange).trainingLoad,
  })

  const sleepAverageLabel =
    sleepAvg7 === null ? NO_DATA : `${formatDurationClock(sleepAvg7)} h`
  const sleepNightLabel =
    lastSleep === null
      ? null
      : lastSleep.date === todayKey
        ? 'Letzte Nacht'
        : formatDayMonth(fromDayKey(lastSleep.date))
  const sleepFootnote =
    sleepNightLabel === null
      ? `Ø 7 Tage: ${sleepAverageLabel}`
      : `${sleepNightLabel} · Ø 7 Tage: ${sleepAverageLabel}`

  const hrvChartPoints = hrvPoints
    .slice(-HRV_CHART_DAYS)
    .map((point) => ({ date: point.date, hrvMs: point.value }))

  const weekLabel = formatDateRangeLabel(fromDayKey(week.from), addDays(week.to, -1))

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Übersicht"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-secondary">{weekLabel}</span>
            {IS_MOCK_DATA ? <Badge>Demodaten</Badge> : null}
          </div>
        }
      />

      {/* ── this week ── */}
      <section aria-labelledby="woche-titel">
        <h2 id="woche-titel" className="sr-only">
          Diese Woche
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <StatTile
              label="Kilometer diese Woche"
              value={formatKm(summary.distanceM, 1)}
              unit="km"
              delta={distanceDelta.deltaPct}
              footnote={`Vorwoche: ${formatDistance(previousSummary.distanceM)}`}
            >
              <Sparkline
                values={weekSummaries.map((entry) => entry.distanceM / 1000)}
                label={`Kilometer je Woche, letzte ${String(HISTORY_WEEKS)} Wochen`}
              />
            </StatTile>
          </Card>

          <Card>
            <StatTile
              label="Trainingszeit diese Woche"
              value={formatDurationClock(summary.durationSec)}
              unit="h"
              delta={durationDelta.deltaPct}
              footnote={`Vorwoche: ${formatDuration(previousSummary.durationSec)}`}
            >
              <Sparkline
                values={weekSummaries.map((entry) => entry.durationSec / 3600)}
                label={`Trainingszeit je Woche, letzte ${String(HISTORY_WEEKS)} Wochen`}
              />
            </StatTile>
          </Card>

          <Card>
            <StatTile
              label="Höhenmeter"
              value={formatNumber(summary.elevationGainM)}
              unit="m"
              delta={elevationDelta.deltaPct}
              footnote={`Vorwoche: ${formatElevation(previousSummary.elevationGainM)}`}
            >
              <Sparkline
                values={weekSummaries.map((entry) => entry.elevationGainM)}
                label={`Höhenmeter je Woche, letzte ${String(HISTORY_WEEKS)} Wochen`}
              />
            </StatTile>
          </Card>

          <Card>
            <StatTile
              label="Aktivitäten"
              value={formatNumber(summary.activityCount)}
              delta={countDelta.deltaPct}
              footnote={`Vorwoche: ${formatNumber(previousSummary.activityCount)}`}
            >
              <Sparkline
                values={weekSummaries.map((entry) => entry.activityCount)}
                label={`Aktivitäten je Woche, letzte ${String(HISTORY_WEEKS)} Wochen`}
              />
            </StatTile>
          </Card>
        </div>
      </section>

      {/* ── health ── */}
      <section aria-labelledby="gesundheit-titel">
        <h2 id="gesundheit-titel" className="sr-only">
          Gesundheit
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <StatTile
              label="HRV"
              value={tileValue(hrvTrend.current)}
              unit="ms"
              delta={hrvTrend.deviationPct}
              deltaLabel="Abweichung von der Baseline"
              footnote={`Ø 7 Tage: ${formatHrv(hrvTrend.avg7)}`}
            />
          </Card>

          <Card>
            <StatTile
              label="Ruhepuls"
              value={tileValue(restingTrend.current)}
              unit="bpm"
              delta={restingTrend.deviationPct}
              deltaLabel="Abweichung von der Baseline"
              deltaInvert
              footnote={`Ø 7 Tage: ${formatHeartRate(restingTrend.avg7)}`}
            />
          </Card>

          <Card>
            <StatTile
              label="Schlafdauer"
              value={lastSleep?.value === undefined ? null : formatDurationClock(lastSleep.value)}
              unit="h"
              footnote={sleepFootnote}
            />
          </Card>

          <Card>
            <RecoveryTile providerScore={providerRecovery} readiness={readiness} />
          </Card>
        </div>
      </section>

      {/* ── week goals, zones, volume, HRV ── */}
      {/* HRV spans the full row: it is the headline health trend and a wide
          time axis is what makes the movement against the baseline readable. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <WeekGoals rows={goals} />
        <ZonePanel heartRate={heartRateZones} power={powerZones} />
        <VolumePanel points={volumePoints} />
        <div className="xl:col-span-3">
          <HrvPanel points={hrvChartPoints} baseline={hrvTrend.baseline} />
        </div>
      </div>

      <RecentActivities activities={recentActivities} />
    </div>
  )
}
