import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import {
  PERIOD_PARAM,
  clockLabel,
  healthPeriodLabel,
  joinGerman,
  latestMeasured,
  metricFormatter,
  parseHealthPeriod,
  sleepBars,
  sleepGranularityFor,
  sourceLabel,
  summarizeSleep,
  tileValue,
  trendRows,
  valueOn,
  type HealthPeriod,
  type MetricFormatter,
  type MetricUnit,
  type TrendRow,
} from '@/components/health/health-metrics'
import { MetricTrendChart } from '@/components/health/metric-trend-chart'
import { PeriodFilter } from '@/components/health/period-filter'
import { RecoveryChart } from '@/components/health/recovery-chart'
import { SleepDurationChart } from '@/components/health/sleep-duration-chart'
import { SleepStageBar } from '@/components/health/sleep-stage-bar'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { PageHeader, SectionHeading } from '@/components/ui/section'
import { StatTile } from '@/components/ui/stat-tile'
import {
  deriveReadiness,
  metricSeries,
  metricTrend,
  recoverySeries,
  sleepSeries,
  summarizeWeek,
  type MetricTrend,
  type Readiness,
  type SeriesPoint,
} from '@/lib/analytics'
import { IS_MOCK_DATA, getRepository } from '@/lib/data'
import { addDays, fromDayKey, periodToRange, rangeContains, toDayKey } from '@/lib/date'
import type { DateRange, ProviderId, RecoveryMetric } from '@/lib/domain/types'
import {
  formatDateLong,
  formatDateRangeLabel,
  formatDayMonth,
  formatDelta,
  formatNumber,
  formatHoursMinutes,
} from '@/lib/format'

/**
 * Gesundheit — HRV, Ruhepuls, Schlaf und Erholung über einen wählbaren
 * Zeitraum. The selected period lives in ?zeitraum= and drives every chart on
 * the page; the server recomputes all series from it in one pass.
 *
 * Two rules shape this screen. First: nothing is invented. A day without a
 * measurement is null, shows "keine Daten" and leaves a hole in the line.
 * Second: every number says where it comes from — a provider score is labelled
 * with its source, our own estimate wears a "berechnet" badge, and neither is
 * presented as a medical assessment.
 */

export const metadata: Metadata = {
  title: 'Gesundheit · strwo',
  description: 'HRV, Ruhepuls, Schlaf und Erholung im Verlauf',
}

/**
 * History loaded on top of the selected period. metricTrend reads its baseline
 * from the last 60 days that carry a measurement, so a 7-day view still needs
 * months of context behind it — otherwise the "Baseline" would just be the week.
 */
const BASELINE_HISTORY_DAYS = 90
/** Window the readiness estimate reads recent training load from. */
const RECENT_LOAD_DAYS = 7

const HRV_CHART_HEIGHT = 300
const RESTING_CHART_HEIGHT = 260
/** Head- and foot-room around the data, in each metric's own unit. */
const HRV_Y_PADDING = 4
const RESTING_Y_PADDING = 3

/** Matches the tolerance band MetricTrendChart draws around the baseline. */
const BASELINE_BAND_LABEL = '± 3 %'

interface GesundheitPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// ── copy helpers ─────────────────────────────────────────────────────────────

function measurementFootnote(
  todayValue: number | null,
  latest: SeriesPoint | null,
  format: MetricFormatter,
): string {
  if (todayValue !== null) return 'Messung von heute'
  if (latest === null) return 'Keine Messung in den letzten 90 Tagen'
  return `Zuletzt am ${formatDayMonth(fromDayKey(latest.date))}: ${format(latest.value)}`
}

function baselineHint(baseline: number | null, format: MetricFormatter): string {
  if (baseline === null) return 'Noch keine Baseline — dafür fehlen die Messungen'
  return `Baseline ${format(baseline)} ${BASELINE_BAND_LABEL} · Mittel der letzten 60 gemessenen Tage`
}

function readinessInputsNote(readiness: Readiness | null): string {
  if (readiness === null) {
    return 'Ohne HRV und Ruhepuls wird nichts geschätzt — die beiden tragen den Wert'
  }
  const inputs = ['HRV', 'Ruhepuls']
  if (readiness.inputs.sleep) inputs.push('Schlafdauer')
  if (readiness.inputs.load) inputs.push('Trainingsbelastung der letzten 7 Tage')
  return `Berechnet aus ${joinGerman(inputs)}`
}

/** Provider behind the most recent recovery score, for the source label. */
function recoveryProviderOf(items: readonly RecoveryMetric[]): ProviderId | null {
  const scored = items.filter((item) => item.providerScore !== null)
  const sorted = [...scored].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return sorted[sorted.length - 1]?.source.provider ?? null
}

// ── HRV / Ruhepuls ───────────────────────────────────────────────────────────

interface MetricSectionProps {
  /** id of the section heading, referenced by aria-labelledby. */
  headingId: string
  title: string
  description: string
  unit: MetricUnit
  trend: MetricTrend
  /** Today's own measurement — not the last one that happens to exist. */
  todayValue: number | null
  latest: SeriesPoint | null
  rows: readonly TrendRow[]
  todayLabel: string
  /** Lower is better (Ruhepuls): flips which direction the badge calls good. */
  deviationInvert: boolean
  yPadding: number
  chartHeight: number
  periodLabel: string
  note: string
  emptyDescription: string
}

/**
 * HRV and Ruhepuls read identically: five tiles against the personal baseline,
 * then the daily values with their 7-day mean and the baseline band.
 */
function MetricSection({
  headingId,
  title,
  description,
  unit,
  trend,
  todayValue,
  latest,
  rows,
  todayLabel,
  deviationInvert,
  yPadding,
  chartHeight,
  periodLabel,
  note,
  emptyDescription,
}: MetricSectionProps): ReactElement {
  const format = metricFormatter(unit)

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <SectionHeading id={headingId} title={title} description={description} />

      <Card>
        <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label={todayLabel}
            value={tileValue(todayValue, format)}
            footnote={measurementFootnote(todayValue, latest, format)}
          />
          <StatTile
            label="Ø 7 Tage"
            value={tileValue(trend.avg7, format)}
            delta={trend.deviationPct}
            deltaLabel="Abweichung von der Baseline"
            deltaInvert={deviationInvert}
          />
          <StatTile label="Ø 30 Tage" value={tileValue(trend.avg30, format)} />
          <StatTile
            label="Baseline"
            value={tileValue(trend.baseline, format)}
            footnote="Mittel der letzten 60 gemessenen Tage"
          />
          <StatTile
            label="Abweichung von der Baseline"
            value={trend.deviationPct === null ? null : formatDelta(trend.deviationPct)}
            footnote={`Ø 7 Tage gegenüber der Baseline · bis ${BASELINE_BAND_LABEL} gilt als unverändert`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Verlauf · ${periodLabel}`}
          hint={baselineHint(trend.baseline, format)}
        />
        <CardBody className="flex flex-col gap-4">
          <MetricTrendChart
            rows={rows}
            seriesLabel={title}
            unit={unit}
            baseline={trend.baseline}
            yPadding={yPadding}
            height={chartHeight}
            chartLabel={`${title}, ${periodLabel}`}
            emptyDescription={emptyDescription}
          />
          <p className="max-w-prose text-sm text-ink-secondary">{note}</p>
        </CardBody>
      </Card>
    </section>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function GesundheitPage({
  searchParams,
}: GesundheitPageProps): Promise<ReactElement> {
  // Next 16 hands searchParams over as a promise. The period is the only state
  // this page has, and it lives in the URL.
  const params = await searchParams
  const period: HealthPeriod = parseHealthPeriod(params[PERIOD_PARAM])
  const periodLabel = healthPeriodLabel(period)

  const today = new Date()
  const todayKey = toDayKey(today)
  const periodRange = periodToRange(period, today, null)

  // The visible range, widened to whatever the baseline needs behind it.
  const historyStart = toDayKey(addDays(today, -(BASELINE_HISTORY_DAYS - 1)))
  const historyRange: DateRange = {
    from: periodRange.from < historyStart ? periodRange.from : historyStart,
    to: periodRange.to,
  }
  const recentLoadRange: DateRange = {
    from: toDayKey(addDays(today, -(RECENT_LOAD_DAYS - 1))),
    to: toDayKey(addDays(today, 1)),
  }

  const repository = getRepository()
  const [daily, sleep, recovery, recentActivities] = await Promise.all([
    repository.getDailyHealth(historyRange),
    repository.getSleepSessions(historyRange),
    repository.getRecoveryMetrics(historyRange),
    repository.getActivities(recentLoadRange),
  ])

  // ── HRV and Ruhepuls ───────────────────────────────────────────────────────

  const hrvPoints = metricSeries(daily, 'hrvMs', historyRange)
  const restingPoints = metricSeries(daily, 'restingHeartRate', historyRange)

  const hrvTrend = metricTrend(hrvPoints)
  const restingTrend = metricTrend(restingPoints)

  const hrvRows = trendRows(hrvPoints, periodRange)
  const restingRows = trendRows(restingPoints, periodRange)

  // ── Schlaf ─────────────────────────────────────────────────────────────────

  const sleepInPeriod = sleep.filter((session) => rangeContains(periodRange, session.date))
  const sleepSummary = summarizeSleep(sleepInPeriod)
  const sleepGranularity = sleepGranularityFor(period)
  const sleepRows = sleepBars(sleepSeries(sleep, periodRange), sleepGranularity)

  const lastNight = sleepSummary.latest
  const lastNightLabel =
    lastNight === null ? null : `Nacht auf ${formatDateLong(fromDayKey(lastNight.date))}`
  const nightCountNote = `${formatNumber(sleepSummary.nightCount)} gemessene ${
    sleepSummary.nightCount === 1 ? 'Nacht' : 'Nächte'
  } im Zeitraum`

  // ── Erholung ───────────────────────────────────────────────────────────────

  const recoveryPoints = recoverySeries(recovery, periodRange)
  const recoveryProvider = recoveryProviderOf(recovery)
  const recoverySource = sourceLabel(recoveryProvider)
  const latestRecovery = latestMeasured(recoveryPoints)

  const readiness = deriveReadiness({
    hrv: hrvTrend,
    restingHr: restingTrend,
    // Last night as it was measured — never the period average standing in.
    sleepSec: lastNight?.durationSec ?? null,
    recentLoad: summarizeWeek(recentActivities, recentLoadRange).trainingLoad,
  })

  const subline = `${periodLabel} · ${formatDateRangeLabel(fromDayKey(periodRange.from), today)}`

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Gesundheit"
        subline={subline}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter value={period} />
            {IS_MOCK_DATA ? <Badge tone="warning">Demodaten</Badge> : null}
          </div>
        }
      />

      <MetricSection
        headingId="gesundheit-hrv"
        title="HRV"
        description="Herzratenvariabilität im Verlauf, gelesen gegen die persönliche Baseline"
        unit="hrv"
        trend={hrvTrend}
        todayValue={valueOn(hrvPoints, todayKey)}
        latest={latestMeasured(hrvPoints)}
        rows={hrvRows}
        todayLabel="HRV heute"
        deviationInvert={false}
        yPadding={HRV_Y_PADDING}
        chartHeight={HRV_CHART_HEIGHT}
        periodLabel={periodLabel}
        note="Eine einzelne Messung sagt für sich genommen wenig: Die HRV schwankt von Tag zu Tag deutlich. Aussagekräftig ist der Verlauf — wie sich der Schnitt der letzten sieben Tage zur eigenen Baseline verhält."
        emptyDescription={`Für ${periodLabel} liegen keine HRV-Messungen vor`}
      />

      <MetricSection
        headingId="gesundheit-ruhepuls"
        title="Ruhepuls"
        description="Ruhepuls je Tag; hier gilt ein Wert unter der Baseline als das bessere Zeichen"
        unit="heartRate"
        trend={restingTrend}
        todayValue={valueOn(restingPoints, todayKey)}
        latest={latestMeasured(restingPoints)}
        rows={restingRows}
        todayLabel="Ruhepuls heute"
        deviationInvert
        yPadding={RESTING_Y_PADDING}
        chartHeight={RESTING_CHART_HEIGHT}
        periodLabel={periodLabel}
        note="Auch hier zählt der Verlauf, nicht der einzelne Morgen. Ein dauerhaft erhöhter Ruhepuls gegenüber der Baseline begleitet oft Belastung, Schlafmangel oder einen beginnenden Infekt — er beweist keines davon."
        emptyDescription={`Für ${periodLabel} liegen keine Ruhepuls-Messungen vor`}
      />

      {/* ── Schlaf ── */}
      <section aria-labelledby="gesundheit-schlaf" className="flex flex-col gap-4">
        <SectionHeading
          id="gesundheit-schlaf"
          title="Schlaf"
          description="Dauer, Rhythmus und Phasen — so, wie die Datenquelle sie geliefert hat"
        />

        <Card>
          <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Schlafdauer letzte Nacht"
              value={lastNight === null ? null : formatHoursMinutes(lastNight.durationSec)}
              footnote={lastNightLabel ?? 'Keine Schlafdaten im Zeitraum'}
            />
            <StatTile
              label="Ø Schlafdauer"
              value={tileValue(sleepSummary.avgDurationSec, formatHoursMinutes)}
              footnote={nightCountNote}
            />
            <StatTile
              label="Einschlafzeit"
              value={
                sleepSummary.avgBedtimeOffset === null
                  ? null
                  : clockLabel(sleepSummary.avgBedtimeOffset)
              }
              footnote="Mittel der gemessenen Nächte"
            />
            <StatTile
              label="Aufwachzeit"
              value={
                sleepSummary.avgWakeMinutes === null
                  ? null
                  : clockLabel(sleepSummary.avgWakeMinutes)
              }
              footnote="Mittel der gemessenen Nächte"
            />
            <StatTile
              label="Schlafkonsistenz"
              value={
                sleepSummary.bedtimeStdDevMin === null
                  ? null
                  : `± ${formatNumber(sleepSummary.bedtimeStdDevMin)} min`
              }
              footnote="Standardabweichung der Einschlafzeit — kein Bewertungsscore"
            />
            {sleepSummary.hasSleepScore ? (
              <StatTile
                label="Schlafqualität"
                value={
                  sleepSummary.latestSleepScore === null
                    ? null
                    : formatNumber(sleepSummary.latestSleepScore)
                }
                unit="/ 100"
                footnote={sourceLabel(sleepSummary.sleepScoreProvider)}
              />
            ) : null}
          </CardBody>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card>
            <CardHeader
              title={sleepGranularity === 'nightly' ? 'Schlafdauer je Nacht' : 'Schlafdauer je Woche'}
              hint={
                sleepGranularity === 'nightly'
                  ? `Gemessene Schlafzeit je Nacht · ${periodLabel}`
                  : `Mittel der gemessenen Nächte je Kalenderwoche · ${periodLabel}`
              }
            />
            <CardBody>
              <SleepDurationChart
                rows={sleepRows}
                granularity={sleepGranularity}
                chartLabel={`Schlafdauer, ${periodLabel}`}
                emptyDescription={`Für ${periodLabel} liegen keine Schlafmessungen vor`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Schlafphasen letzte Nacht"
              hint={
                lastNight === null
                  ? 'Keine Nacht im Zeitraum gemessen'
                  : `${lastNightLabel ?? ''} · ${sourceLabel(lastNight.source.provider)}`
              }
            />
            <CardBody>
              <SleepStageBar
                stages={lastNight?.stages ?? null}
                label="Schlafphasen der letzten Nacht"
                emptyDescription={
                  lastNight === null
                    ? 'Für diesen Zeitraum liegt keine gemessene Nacht vor'
                    : 'Für diese Nacht hat die Datenquelle keine Phasenaufteilung geliefert'
                }
              />
            </CardBody>
          </Card>
        </div>
      </section>

      {/* ── Erholung ── */}
      <section aria-labelledby="gesundheit-erholung" className="flex flex-col gap-4">
        <SectionHeading
          id="gesundheit-erholung"
          title="Erholung"
          description="Der Wert der Datenquelle und, davon getrennt, unsere eigene Schätzung"
        />

        <Card>
          <CardHeader
            title="Erholung laut Datenquelle"
            hint={
              recoveryProvider === null
                ? `${periodLabel} · keine Quelle liefert Erholungswerte`
                : `${periodLabel} · Wert unverändert übernommen, nicht nachgerechnet`
            }
            {...(recoveryProvider === null
              ? {}
              : { action: <Badge tone="neutral">{recoverySource}</Badge> })}
          />
          <CardBody className="flex flex-col gap-5">
            <StatTile
              label="Zuletzt gemeldeter Wert"
              value={latestRecovery === null ? null : formatNumber(latestRecovery.value)}
              unit="/ 100"
              footnote={
                latestRecovery === null
                  ? 'Keine Quelle liefert Erholungsdaten für diesen Zeitraum'
                  : `${formatDateLong(fromDayKey(latestRecovery.date))} · ${recoverySource}`
              }
            />
            <RecoveryChart
              rows={recoveryPoints}
              seriesLabel="Erholung"
              footnote={recoverySource}
              chartLabel={`Erholung laut Datenquelle, ${periodLabel}`}
              emptyDescription={`Für ${periodLabel} liegen keine Erholungswerte der Datenquelle vor`}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Bereitschaft"
            hint="Kein Wert einer Datenquelle, sondern aus den eigenen Messwerten berechnet"
          />
          <CardBody className="flex flex-col gap-4">
            <StatTile
              label="Bereitschaft heute"
              value={readiness === null ? null : formatNumber(readiness.score)}
              unit="/ 100"
              footnote={readinessInputsNote(readiness)}
            >
              {readiness === null ? null : (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink-secondary">{readiness.label}</span>
                  <Badge tone="info">berechnet</Badge>
                </span>
              )}
            </StatTile>
            <p className="max-w-prose text-sm text-ink-secondary">
              Die Bereitschaft gewichtet die Abweichung von HRV und Ruhepuls gegenüber der eigenen
              Baseline und schattiert das Ergebnis mit Schlafdauer und jüngster Trainingsbelastung.
              Fehlt eine der beiden optionalen Größen, entfällt sie, statt als Null zu zählen.
            </p>
          </CardBody>
        </Card>

        <p className="max-w-prose text-xs text-ink-muted">
          Keine medizinische Bewertung. Weder der Wert der Datenquelle noch die berechnete
          Bereitschaft ist eine Diagnose.
        </p>
      </section>
    </div>
  )
}
