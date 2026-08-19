'use client'

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'

import { TrendLineChart } from '@/components/charts/line-chart'
import type { TrendSeries } from '@/components/charts/line-chart'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SectionHeading } from '@/components/ui/section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { SegmentedOption } from '@/components/ui/segmented-control'
import { StatTile } from '@/components/ui/stat-tile'
import { fromDayKey } from '@/lib/date'
import { formatDayMonth, formatNumber, formatWeekdayShort } from '@/lib/format'
import type { LoadPoint } from '@/components/training/data'

/**
 * "Trainingsbelastung": the provider's own load value per day, and nothing
 * else. See the seam at the bottom of this file for the metrics that are
 * deliberately absent until the data supports them.
 */

const HEADING_ID = 'training-load'

const CHART_HEIGHT = 260

type LoadPeriod = '4w' | '8w' | '12w'

const PERIOD_OPTIONS: Array<SegmentedOption<LoadPeriod>> = [
  { value: '4w', label: '4 Wochen' },
  { value: '8w', label: '8 Wochen' },
  { value: '12w', label: '12 Wochen' },
]

const PERIOD_DAYS: Record<LoadPeriod, number> = { '4w': 28, '8w': 56, '12w': 84 }

interface LoadStats {
  /** Sum over the days that carry a value; null when none do. */
  total: number | null
  /** Days with a load greater than zero. */
  trainingDays: number
  averagePerTrainingDay: number | null
  peak: number | null
  peakDate: string | null
  hasData: boolean
}

function summarize(points: readonly LoadPoint[]): LoadStats {
  let total: number | null = null
  let trainingDays = 0
  let peak: number | null = null
  let peakDate: string | null = null

  for (const point of points) {
    if (point.load === null || !Number.isFinite(point.load)) continue
    total = (total ?? 0) + point.load
    if (point.load > 0) trainingDays += 1
    if (peak === null || point.load > peak) {
      peak = point.load
      peakDate = point.date
    }
  }

  return {
    total,
    trainingDays,
    averagePerTrainingDay: total !== null && trainingDays > 0 ? total / trainingDays : null,
    peak,
    peakDate,
    hasData: total !== null,
  }
}

function dayLabel(dayKey: string): string {
  const date = fromDayKey(dayKey)
  return `${formatWeekdayShort(date)}, ${formatDayMonth(date)}`
}

export interface LoadPanelProps {
  /** Daily provider load, oldest first, one entry per day of the window. */
  points: LoadPoint[]
  /** "Whoop Strain", "TSS", … or null when no activity reported a load. */
  loadKindLabel: string | null
}

export function LoadPanel({ points, loadKindLabel }: LoadPanelProps): ReactElement {
  const [period, setPeriod] = useState<LoadPeriod>('8w')

  const visible = useMemo(() => points.slice(-PERIOD_DAYS[period]), [points, period])
  const stats = useMemo(() => summarize(visible), [visible])

  const series: Array<TrendSeries<LoadPoint>> = [
    {
      dataKey: 'load',
      label: 'Trainingsbelastung',
      format: (value) => formatNumber(value, 1),
    },
  ]

  const sourceHint =
    loadKindLabel === null
      ? 'Tagesbelastung laut Datenquelle'
      : `Tagesbelastung laut Datenquelle (${loadKindLabel})`

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <SectionHeading
        id={HEADING_ID}
        title="Trainingsbelastung"
        description="Belastungswerte, wie sie die Datenquelle geliefert hat"
        action={
          <SegmentedControl<LoadPeriod>
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
            label="Zeitraum der Trainingsbelastung"
            size="sm"
          />
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card>
          <CardHeader title="Belastung je Tag" hint={sourceHint} as="h3" />

          <CardBody className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <StatTile
                label="Belastung gesamt"
                value={stats.total === null ? null : formatNumber(stats.total)}
              />
              <StatTile
                label="Trainingstage"
                value={stats.hasData ? formatNumber(stats.trainingDays) : null}
                footnote={`von ${formatNumber(visible.length)} Tagen`}
              />
              <StatTile
                label="Ø je Trainingstag"
                value={
                  stats.averagePerTrainingDay === null
                    ? null
                    : formatNumber(stats.averagePerTrainingDay, 1)
                }
                {...(stats.peak !== null && stats.peakDate !== null
                  ? {
                      footnote: `Höchstwert ${formatNumber(stats.peak, 1)} am ${dayLabel(stats.peakDate)}`,
                    }
                  : {})}
              />
            </div>

            <TrendLineChart<LoadPoint>
              data={visible}
              xKey="date"
              series={series}
              height={CHART_HEIGHT}
              formatX={(value) => formatDayMonth(fromDayKey(value))}
              formatY={(value) => formatNumber(value)}
              formatTooltipLabel={dayLabel}
              label="Trainingsbelastung je Tag"
              emptyTitle="Keine Belastungsdaten"
              emptyDescription="Für diesen Zeitraum hat keine Datenquelle einen Belastungswert geliefert."
            />

            {stats.hasData ? (
              <p className="text-xs text-ink-muted">
                Tage ohne Aktivität zählen als 0. Tage mit Aktivitäten, zu denen die Datenquelle
                keinen Belastungswert liefert, bleiben leer.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Was hier noch fehlt" as="h3" />
          <CardBody className="flex flex-col gap-3 text-sm text-ink-secondary">
            <p>
              Akutbelastung, Dauerbelastung, Fitness und Ermüdung sind bewusst nicht dargestellt.
              Diese Kennzahlen setzen eine lückenlose tägliche Belastungsreihe voraus – die
              angebundenen Quellen liefern derzeit nur Werte je Aktivität.
            </p>
            <p>
              Sobald eine Quelle durchgehende Tageswerte liefert, werden sie hier ergänzt und als
              berechnete Werte gekennzeichnet. Bis dahin zeigt dieses Panel ausschließlich, was in
              den Daten steht.
            </p>
          </CardBody>
        </Card>
      </div>
    </section>
  )
}

// ── seam: Akutbelastung, Dauerbelastung, Fitness, Ermüdung ───────────────────
//
// Nothing above derives a training-state metric, and that is deliberate: ATL
// (acute load, ~7 days), CTL (chronic load, ~42 days) and the balance between
// them are only meaningful on an unbroken daily load series. What the providers
// deliver today is a load value per activity, so the days in between carry no
// measurement and any exponential average over them would invent the very trend
// it claims to show.
//
// When a source starts delivering continuous daily load, the extension is:
//   1. widen `LoadPoint` in src/components/training/data.ts with the derived
//      fields (e.g. `acuteLoad`, `chronicLoad`), computed in the server-side
//      builder next to `buildLoadSeries` — never here in the client.
//   2. add them to `series` above as additional, dashed `TrendSeries` entries;
//      the chart then renders its legend on its own (two or more series).
//   3. mark them as derived in the UI the way the readiness score is marked:
//      the hint word is "berechnet", so nobody reads them as measurements.
