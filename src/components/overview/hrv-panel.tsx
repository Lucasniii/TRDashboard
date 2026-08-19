'use client'

import type { ReactElement } from 'react'

import { TrendLineChart } from '@/components/charts/line-chart'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { fromDayKey } from '@/lib/date'
import { formatDateLong, formatDayMonth, formatHrv, formatNumber } from '@/lib/format'

/**
 * HRV over the last 30 days against the personal baseline. Days without a
 * measurement stay holes in the line — the chart never bridges them — and the
 * band is drawn from the baseline itself, so it moves with the athlete.
 */

const CHART_DAYS = 30
const CHART_HEIGHT = 260

/** Half-width of the tolerance band around the baseline, as a share of it. */
const BASELINE_BAND_SHARE = 0.05
const BASELINE_BAND_LABEL = '± 5 %'

export interface HrvChartPoint {
  date: string
  hrvMs: number | null
}

export interface HrvPanelProps {
  points: readonly HrvChartPoint[]
  /** Mean of the last 60 days carrying a measurement; null when there is none. */
  baseline: number | null
  className?: string
}

export function HrvPanel({ points, baseline, className }: HrvPanelProps): ReactElement {
  const hint =
    baseline === null
      ? `Letzte ${String(CHART_DAYS)} Tage`
      : `Letzte ${String(CHART_DAYS)} Tage · Baseline ${formatHrv(baseline)} ${BASELINE_BAND_LABEL}`

  return (
    <Card aria-labelledby="hrv-titel" className={cn(className)}>
      <CardHeader id="hrv-titel" title="HRV" hint={hint} />
      <CardBody>
        <TrendLineChart
          data={points}
          xKey="date"
          series={[
            { dataKey: 'hrvMs', label: 'HRV', format: (value: number) => formatHrv(value) },
          ]}
          height={CHART_HEIGHT}
          yDomain={['dataMin - 4', 'dataMax + 4']}
          formatX={(value: string) => formatDayMonth(fromDayKey(value))}
          formatY={(value: number) => formatNumber(value)}
          formatTooltipLabel={(value: string) => formatDateLong(fromDayKey(value))}
          {...(baseline === null
            ? {}
            : {
                baseline: {
                  value: baseline,
                  band: baseline * BASELINE_BAND_SHARE,
                  label: 'Baseline',
                },
              })}
          emptyTitle="Keine HRV-Daten"
          emptyDescription={`Für die letzten ${String(CHART_DAYS)} Tage liegen keine HRV-Messungen vor`}
          label={`HRV, letzte ${String(CHART_DAYS)} Tage`}
        />
      </CardBody>
    </Card>
  )
}
