'use client'

import { useMemo, useState } from 'react'

import { MUTED_COLOR, seriesColor } from '@/components/charts/chart-frame'
import type { TrendSeries } from '@/components/charts/line-chart'
import { SyncedPanels } from '@/components/charts/synced-panels'
import type { SyncedPanel } from '@/components/charts/synced-panels'
import { CorrelationCard } from '@/components/trends/correlation-card'
import type { CorrelationPair } from '@/components/trends/correlation-card'
import { MetricPicker } from '@/components/trends/metric-picker'
import {
  DEFAULT_TREND_METRICS,
  MAX_TREND_METRICS,
  TREND_METRICS,
  TREND_METRIC_IDS,
  type TrendMetricId,
} from '@/components/trends/metrics'
import type { TrendDataset } from '@/components/trends/trend-dataset'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { SegmentedOption } from '@/components/ui/segmented-control'
import { rollingAverage } from '@/lib/analytics/health'
import type { SeriesPoint } from '@/lib/analytics/health'
import { correlate } from '@/lib/analytics/trends'
import { PERIOD_LABELS, fromDayKey, periodToRange } from '@/lib/date'
import type { PeriodKey } from '@/lib/date'
import { formatDateLong, formatDateRangeLabel, formatDayMonth } from '@/lib/format'

/**
 * The Trends page in one client component: period, metric selection and the
 * panels that follow from them. Everything recomputes from the dataset the
 * server already handed over, so switching a metric is a redraw, not a reload.
 */

const PERIOD_OPTIONS: ReadonlyArray<SegmentedOption<PeriodKey>> = (
  ['7d', '30d', '3m', '6m', '1y', 'all'] as const
).map((key) => ({ value: key, label: PERIOD_LABELS[key] }))

const AVERAGE_WINDOW = 7
const AVERAGE_LABEL = '7-Tage-Durchschnitt'
/** Under three weeks a trailing seven-day mean says less than the raw days do. */
const AVERAGE_MIN_DAYS = 21

const SHARED_AXIS_CAPTION =
  'Alle Panels teilen sich eine Zeitachse und einen gemeinsamen Zeiger: Jedes Panel behält seine eigene Skala und Einheit, die Datumsbeschriftung steht unter dem untersten Panel.'

const NO_DUAL_AXIS_NOTE =
  'Zwei Messgrößen bekommen zwei Panels statt einer zweiten y-Achse: Wo sich zwei Kurven kreuzen, wäre sonst eine Frage der Skalierung, nicht der Daten.'

/** Row keys: the metric itself and, beside it, its rolling average. */
type TrendRowKey = TrendMetricId | `avg_${TrendMetricId}`

export type TrendRow = { date: string } & Partial<Record<TrendRowKey, number | null>>

function averageKey(id: TrendMetricId): `avg_${TrendMetricId}` {
  return `avg_${id}`
}

function isMeasured(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value)
}

function hasMeasurements(points: readonly SeriesPoint[]): boolean {
  return points.some((point) => isMeasured(point.value))
}

function countCommonDays(a: readonly SeriesPoint[], b: readonly SeriesPoint[]): number {
  let common = 0
  for (let index = 0; index < a.length; index += 1) {
    if (isMeasured(a[index]?.value) && isMeasured(b[index]?.value)) common += 1
  }
  return common
}

interface VisibleData {
  days: string[]
  series: Record<TrendMetricId, SeriesPoint[]>
  /** Activities recorded across the visible days — 0 means "no records", not "rest". */
  activityCount: number
}

function sliceDataset(dataset: TrendDataset, from: string, to: string): VisibleData {
  const indices: number[] = []
  dataset.days.forEach((day, index) => {
    if (day >= from && day < to) indices.push(index)
  })

  const days = indices.map((index) => dataset.days[index] ?? '')

  const series = Object.fromEntries(
    TREND_METRIC_IDS.map((id) => {
      const column = dataset.values[id]
      const points: SeriesPoint[] = indices.map((sourceIndex, position) => ({
        date: days[position] ?? '',
        value: column[sourceIndex] ?? null,
      }))
      return [id, points] as const
    }),
  ) as Record<TrendMetricId, SeriesPoint[]>

  const activityCount = indices.reduce(
    (total, index) => total + (dataset.activityCount[index] ?? 0),
    0,
  )

  return { days, series, activityCount }
}

function formatAxisDay(value: string): string {
  if (value === '') return ''
  return formatDayMonth(fromDayKey(value))
}

function formatTooltipDay(value: string): string {
  if (value === '') return ''
  return formatDateLong(fromDayKey(value))
}

export interface TrendsExplorerProps {
  dataset: TrendDataset
}

export function TrendsExplorer({ dataset }: TrendsExplorerProps) {
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [selected, setSelected] = useState<readonly TrendMetricId[]>(DEFAULT_TREND_METRICS)

  const range = useMemo(
    () => periodToRange(period, fromDayKey(dataset.todayKey), dataset.earliest),
    [period, dataset.todayKey, dataset.earliest],
  )

  const visible = useMemo(
    () => sliceDataset(dataset, range.from, range.to),
    [dataset, range.from, range.to],
  )

  const showAverage = visible.days.length > AVERAGE_MIN_DAYS

  const averages = useMemo(() => {
    if (!showAverage) return {} as Partial<Record<TrendMetricId, SeriesPoint[]>>
    const entries: Array<readonly [TrendMetricId, SeriesPoint[]]> = selected.map((id) => [
      id,
      rollingAverage(visible.series[id], AVERAGE_WINDOW),
    ])
    return Object.fromEntries(entries) as Partial<Record<TrendMetricId, SeriesPoint[]>>
  }, [selected, visible, showAverage])

  const rows = useMemo<TrendRow[]>(
    () =>
      visible.days.map((date, index) => {
        const values: Partial<Record<TrendRowKey, number | null>> = {}
        for (const id of selected) {
          values[id] = visible.series[id][index]?.value ?? null
          const average = averages[id]
          if (average !== undefined) values[averageKey(id)] = average[index]?.value ?? null
        }
        return { date, ...values }
      }),
    [visible, selected, averages],
  )

  const panels = useMemo<Array<SyncedPanel<TrendRow>>>(
    () =>
      selected.map((id, position) => {
        const metric = TREND_METRICS[id]
        const color = seriesColor(position)
        const points = visible.series[id]
        // A volume metric is only empty when nothing was recorded at all: a rest
        // day is a real zero, a range without activity records is not.
        const hasData =
          metric.kind === 'volume' ? visible.activityCount > 0 : hasMeasurements(points)

        const series: Array<TrendSeries<TrendRow>> = [
          {
            dataKey: id,
            label: metric.label,
            color,
            format: metric.formatValue,
          },
        ]
        if (averages[id] !== undefined) {
          series.push({
            dataKey: averageKey(id),
            label: AVERAGE_LABEL,
            color: MUTED_COLOR,
            dashed: true,
            format: metric.formatValue,
          })
        }

        return {
          key: id,
          title: metric.label,
          series,
          formatY: metric.formatAxis,
          formatValue: metric.formatValue,
          yDomain: metric.yDomain,
          isEmpty: !hasData,
          emptyDescription: metric.emptyDescription,
          ...(metric.unit === null ? {} : { unit: metric.unit }),
          ...(metric.hint === undefined ? {} : { hint: metric.hint }),
        }
      }),
    [selected, visible, averages],
  )

  const pair = useMemo<CorrelationPair | null>(() => {
    if (selected.length !== 2) return null
    const [idA, idB] = selected
    if (idA === undefined || idB === undefined) return null
    const a = visible.series[idA]
    const b = visible.series[idB]
    return {
      labelA: TREND_METRICS[idA].label,
      labelB: TREND_METRICS[idB].label,
      r: correlate(a, b),
      commonDays: countCommonDays(a, b),
    }
  }, [selected, visible])

  const firstDay = visible.days[0]
  const lastDay = visible.days[visible.days.length - 1]
  const subline =
    firstDay === undefined || lastDay === undefined
      ? 'Für diesen Zeitraum liegen keine Tage mit Daten vor'
      : `${formatDateRangeLabel(fromDayKey(firstDay), fromDayKey(lastDay))} · ${visible.days.length} Tage`

  function toggleMetric(id: TrendMetricId): void {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id)
      if (current.length >= MAX_TREND_METRICS) return current
      return [...current, id]
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trends"
        subline={subline}
        action={
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            label="Zeitraum"
            size="sm"
          />
        }
      />

      <Card aria-labelledby="messgroessen-titel">
        <CardHeader
          id="messgroessen-titel"
          as="h2"
          title="Messgrößen"
          hint="Bis zu drei Messgrößen aus Training und Gesundheit, gemeinsam über eine Zeitachse gelesen."
        />
        <CardBody>
          <MetricPicker selected={selected} onToggle={toggleMetric} />
        </CardBody>
      </Card>

      <Card aria-labelledby="verlauf-titel">
        <CardHeader id="verlauf-titel" as="h2" title="Verlauf" hint={SHARED_AXIS_CAPTION} />
        <CardBody>
          {panels.length === 0 ? (
            <EmptyState
              title="Keine Messgröße ausgewählt"
              description="Oben lassen sich bis zu drei Messgrößen auswählen; jede erhält ihr eigenes Panel."
            />
          ) : (
            <>
              <SyncedPanels<TrendRow>
                data={rows}
                xKey="date"
                panels={panels}
                formatX={formatAxisDay}
                formatTooltipLabel={formatTooltipDay}
                panelHeight={panels.length >= 3 ? 150 : 180}
              />
              <p className="mt-5 text-xs text-ink-muted">{NO_DUAL_AXIS_NOTE}</p>
            </>
          )}
        </CardBody>
      </Card>

      <CorrelationCard pair={pair} selectedCount={selected.length} />
    </div>
  )
}
