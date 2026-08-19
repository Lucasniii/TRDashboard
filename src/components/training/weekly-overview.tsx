'use client'

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'

import { VolumeBarChart } from '@/components/charts/bar-chart'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SectionHeading } from '@/components/ui/section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { SegmentedOption } from '@/components/ui/segmented-control'
import { VOLUME_METRIC_LABELS } from '@/lib/analytics/trends'
import type { VolumeMetric } from '@/lib/analytics/trends'
import {
  NO_DATA,
  formatDistance,
  formatDuration,
  formatElevation,
  formatKm,
  formatNumber,
} from '@/lib/format'
import { cn } from '@/lib/cn'
import type { WeekRow } from '@/components/training/data'

/**
 * "Wochenübersicht": twelve weekly bars plus the same twelve weeks as a table.
 * The table is not decoration — it is the accessible reading of the chart, so
 * it carries every metric at once instead of only the selected one.
 */

const HEADING_ID = 'training-week-overview'

const METRIC_ORDER: readonly VolumeMetric[] = ['duration', 'distance', 'elevation', 'load']

const CHART_HEIGHT = 280

interface MetricConfig {
  /** Axis unit and reading aid under the panel title. */
  hint: string
  /** Tooltip and the direct label on the running week. */
  formatValue: (value: number) => string
  /** Bare axis ticks — the unit lives in the hint. */
  formatY: (value: number) => string
}

function metricConfig(metric: VolumeMetric, loadKindLabel: string | null): MetricConfig {
  switch (metric) {
    case 'duration':
      return {
        hint: 'Trainingszeit je Kalenderwoche, Achse in Stunden',
        formatValue: formatDuration,
        formatY: (value) => formatNumber(value / 3600),
      }
    case 'distance':
      return {
        hint: 'Kilometer je Kalenderwoche',
        formatValue: (value) => formatDistance(value),
        formatY: (value) => formatKm(value),
      }
    case 'elevation':
      return {
        hint: 'Höhenmeter je Kalenderwoche',
        formatValue: formatElevation,
        formatY: (value) => formatNumber(value),
      }
    case 'load':
      return {
        hint:
          loadKindLabel === null
            ? 'Trainingsbelastung je Kalenderwoche'
            : `Trainingsbelastung je Kalenderwoche (${loadKindLabel})`,
        formatValue: (value) => formatNumber(value, 1),
        formatY: (value) => formatNumber(value),
      }
  }
}

/** Row field the metric is stored under — the labels come from the analytics layer. */
const METRIC_KEYS: Record<VolumeMetric, Extract<keyof WeekRow, string>> = {
  duration: 'durationSec',
  distance: 'distanceM',
  elevation: 'elevationGainM',
  load: 'load',
}

interface Totals {
  durationSec: number
  distanceM: number
  elevationGainM: number
  load: number | null
  activityCount: number
}

function sumRows(rows: readonly WeekRow[]): Totals {
  const totals: Totals = {
    durationSec: 0,
    distanceM: 0,
    elevationGainM: 0,
    load: null,
    activityCount: 0,
  }
  for (const row of rows) {
    totals.durationSec += row.durationSec
    totals.distanceM += row.distanceM
    totals.elevationGainM += row.elevationGainM
    totals.activityCount += row.activityCount
    // Stays null until a week actually reported a load value.
    if (row.load !== null) totals.load = (totals.load ?? 0) + row.load
  }
  return totals
}

const HEAD_CELL = 'py-2 text-xs font-medium uppercase tracking-wide text-ink-muted'
const CELL = 'py-2 tabular text-right whitespace-nowrap'

export interface WeeklyOverviewProps {
  rows: WeekRow[]
  /** "Whoop Strain", "TSS", … or null when no activity reported a load. */
  loadKindLabel: string | null
}

export function WeeklyOverview({ rows, loadKindLabel }: WeeklyOverviewProps): ReactElement {
  const [metric, setMetric] = useState<VolumeMetric>('duration')

  const options: Array<SegmentedOption<VolumeMetric>> = METRIC_ORDER.map((key) => ({
    value: key,
    label: VOLUME_METRIC_LABELS[key],
  }))

  const config = metricConfig(metric, loadKindLabel)
  const totals = useMemo(() => sumRows(rows), [rows])
  const hasRunningWeek = rows.some((row) => row.isCurrent)

  // "KW 34" alone is thin as a tooltip heading; the week's dates complete it.
  const weekRangeLabels = useMemo(() => {
    const index = new Map<string, string>()
    for (const row of rows) index.set(row.weekLabel, row.rangeLabel)
    return index
  }, [rows])

  const columnTone = (key: VolumeMetric): string =>
    metric === key ? 'text-ink' : 'text-ink-secondary'

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <SectionHeading
        id={HEADING_ID}
        title="Wochenübersicht"
        description={`Die letzten ${formatNumber(rows.length)} Kalenderwochen`}
        action={
          <SegmentedControl<VolumeMetric>
            options={options}
            value={metric}
            onChange={setMetric}
            label="Messgröße der Wochenübersicht"
            size="sm"
          />
        }
      />

      <Card>
        <CardHeader title={VOLUME_METRIC_LABELS[metric]} hint={config.hint} as="h3" />

        <CardBody>
          <VolumeBarChart<WeekRow>
            data={rows}
            xKey="weekLabel"
            valueKey={METRIC_KEYS[metric]}
            emphasisKey="isCurrent"
            label={VOLUME_METRIC_LABELS[metric]}
            formatValue={config.formatValue}
            formatY={config.formatY}
            formatTooltipLabel={(value) => {
              const range = weekRangeLabels.get(value)
              return range === undefined ? value : `${value} · ${range}`
            }}
            height={CHART_HEIGHT}
            chartLabel={`${VOLUME_METRIC_LABELS[metric]} je Kalenderwoche, letzte ${formatNumber(rows.length)} Wochen`}
            emptyTitle="Keine Wochendaten"
            emptyDescription={
              metric === 'load'
                ? 'Für diese Wochen hat keine Datenquelle einen Belastungswert geliefert.'
                : 'Für diese Wochen liegen keine Aktivitäten vor.'
            }
          />

          {hasRunningWeek ? (
            <p className="mt-3 text-xs text-ink-muted">
              Die laufende Woche ist noch nicht abgeschlossen und daher hervorgehoben.
            </p>
          ) : null}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-sm">
              <caption className="sr-only">
                Wochenübersicht als Tabelle: dieselben Kalenderwochen wie im Diagramm, mit
                Trainingszeit, Kilometern, Höhenmetern, Trainingsbelastung und Anzahl der
                Aktivitäten.
              </caption>
              <thead>
                <tr className="border-b border-border-hair">
                  <th scope="col" className={cn(HEAD_CELL, 'pr-3 text-left')}>
                    KW
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
                    Zeit
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
                    km
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
                    hm
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
                    Belastung
                  </th>
                  <th scope="col" className={cn(HEAD_CELL, 'pl-3 text-right')}>
                    Aktivitäten
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.weekStart} className="border-b border-border-hair last:border-0">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="tabular text-ink">{row.weekLabel}</span>
                        <span className="text-xs text-ink-muted">{row.rangeLabel}</span>
                        {row.isCurrent ? <Badge tone="info">laufend</Badge> : null}
                      </span>
                    </th>
                    <td className={cn(CELL, 'px-3', columnTone('duration'))}>
                      {formatDuration(row.durationSec)}
                    </td>
                    <td className={cn(CELL, 'px-3', columnTone('distance'))}>
                      {formatKm(row.distanceM, 1)}
                    </td>
                    <td className={cn(CELL, 'px-3', columnTone('elevation'))}>
                      {formatNumber(row.elevationGainM)}
                    </td>
                    <td
                      className={cn(
                        CELL,
                        'px-3',
                        row.load === null ? 'text-ink-muted' : columnTone('load'),
                      )}
                    >
                      {row.load === null ? NO_DATA : formatNumber(row.load, 1)}
                    </td>
                    <td className={cn(CELL, 'pl-3 text-ink-secondary')}>
                      {formatNumber(row.activityCount)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-border-strong">
                  <th scope="row" className="py-2 pr-3 text-left text-sm font-medium text-ink">
                    Summe
                  </th>
                  <td className={cn(CELL, 'px-3 font-medium text-ink')}>
                    {formatDuration(totals.durationSec)}
                  </td>
                  <td className={cn(CELL, 'px-3 font-medium text-ink')}>
                    {formatKm(totals.distanceM, 1)}
                  </td>
                  <td className={cn(CELL, 'px-3 font-medium text-ink')}>
                    {formatNumber(totals.elevationGainM)}
                  </td>
                  <td
                    className={cn(
                      CELL,
                      'px-3 font-medium',
                      totals.load === null ? 'text-ink-muted' : 'text-ink',
                    )}
                  >
                    {totals.load === null ? NO_DATA : formatNumber(totals.load, 1)}
                  </td>
                  <td className={cn(CELL, 'pl-3 font-medium text-ink')}>
                    {formatNumber(totals.activityCount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>
    </section>
  )
}
