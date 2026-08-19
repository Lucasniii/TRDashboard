'use client'

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'

import { zoneFillClass } from '@/components/charts/chart-frame'
import { ZoneComparisonBars, ZoneDistribution } from '@/components/charts/zone-bar'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeading } from '@/components/ui/section'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { SegmentedOption } from '@/components/ui/segmented-control'
import { compare } from '@/lib/analytics/weekly'
import type { ZoneKind } from '@/lib/domain/types'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { ZoneComparison, ZonePeriodKey } from '@/components/training/data'

/**
 * "Zonenverteilung": where the time actually went, for the selected period and
 * zone kind, next to the same reading for the period before it. Every number is
 * time the provider reported per zone — nothing is redistributed from averages.
 */

const HEADING_ID = 'training-zones'

const KIND_OPTIONS: Array<SegmentedOption<ZoneKind>> = [
  { value: 'heart_rate', label: 'Herzfrequenz' },
  { value: 'power', label: 'Leistung' },
]

const KIND_LABELS: Record<ZoneKind, string> = {
  heart_rate: 'Herzfrequenz',
  power: 'Leistung',
}

const HEAD_CELL = 'py-2 text-xs font-medium uppercase tracking-wide text-ink-muted'

export interface ZonePanelProps {
  /** All periods in both zone kinds, each already paired with its previous period. */
  comparisons: ZoneComparison[]
}

export function ZonePanel({ comparisons }: ZonePanelProps): ReactElement {
  const first = comparisons[0]
  const [period, setPeriod] = useState<ZonePeriodKey>(first?.period ?? 'this_week')
  const [kind, setKind] = useState<ZoneKind>('heart_rate')

  // The server decides which periods exist and in which order; the control only
  // reads them back out.
  const periodOptions = useMemo<Array<SegmentedOption<ZonePeriodKey>>>(() => {
    const seen = new Set<ZonePeriodKey>()
    const options: Array<SegmentedOption<ZonePeriodKey>> = []
    for (const entry of comparisons) {
      if (seen.has(entry.period)) continue
      seen.add(entry.period)
      options.push({ value: entry.period, label: entry.periodLabel })
    }
    return options
  }, [comparisons])

  const active = comparisons.find((entry) => entry.period === period && entry.kind === kind)

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl<ZonePeriodKey>
        options={periodOptions}
        value={period}
        onChange={setPeriod}
        label="Zeitraum der Zonenverteilung"
        size="sm"
      />
      <SegmentedControl<ZoneKind>
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
        label="Zonenart"
        size="sm"
      />
    </div>
  )

  if (active === undefined) {
    return (
      <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
        <SectionHeading id={HEADING_ID} title="Zonenverteilung" action={controls} />
        <Card>
          <CardBody>
            <EmptyState description="Für diesen Zeitraum liegen keine Zonendaten vor" />
          </CardBody>
        </Card>
      </section>
    )
  }

  const { current, previous } = active
  const showComparison = current.hasData || previous.hasData
  const deltaLabel = `Veränderung gegenüber ${active.previousLabel}`
  const totalDelta = compare(current.totalSec, previous.totalSec)

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      <SectionHeading
        id={HEADING_ID}
        title="Zonenverteilung"
        description={`Zeit in Trainingszonen nach ${KIND_LABELS[kind]}`}
        action={controls}
      />

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader
            title="Zeit in Trainingszonen"
            hint={`${active.periodLabel} · ${active.currentRangeLabel}`}
            as="h3"
          />
          <CardBody className="flex flex-col gap-4">
            <ZoneDistribution
              slices={current.slices}
              totalSec={current.totalSec}
              hasData={current.hasData}
              label={`Zeit in Trainingszonen, ${KIND_LABELS[kind]}, ${active.periodLabel}`}
              emptyTitle="Keine Zonendaten"
              emptyDescription={`Für ${active.periodLabel} liegen keine Zonenzeiten nach ${KIND_LABELS[kind]} vor.`}
            />
            {current.hasData ? (
              <p className="text-sm text-ink-secondary">
                Gesamt{' '}
                <span className="font-medium text-ink">{formatDuration(current.totalSec)}</span>
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Im Vergleich"
            hint={`${active.previousLabel} · ${active.previousRangeLabel}`}
            as="h3"
          />
          <CardBody className="flex flex-col gap-5">
            <ZoneComparisonBars
              current={{
                label: active.periodLabel,
                slices: current.slices,
                totalSec: current.totalSec,
              }}
              previous={{
                label: active.previousLabel,
                slices: previous.slices,
                totalSec: previous.totalSec,
              }}
              emptyTitle="Keine Zonendaten"
              emptyDescription={`Weder für ${active.periodLabel} noch für ${active.previousLabel} liegen Zonenzeiten vor.`}
            />

            {showComparison ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Zeit je Trainingszone im Vergleich: {active.periodLabel} gegenüber{' '}
                    {active.previousLabel}.
                  </caption>
                  <thead>
                    <tr className="border-b border-border-hair">
                      <th scope="col" className={cn(HEAD_CELL, 'pr-3 text-left')}>
                        Zone
                      </th>
                      <th scope="col" className={cn(HEAD_CELL, 'px-3 text-right')}>
                        {active.previousLabel}
                      </th>
                      <th scope="col" className={cn(HEAD_CELL, 'pl-3 text-right')}>
                        Veränderung
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.slices.map((slice, index) => {
                      const before = previous.slices[index]
                      const beforeSeconds = before?.seconds ?? 0
                      const delta = compare(slice.seconds, beforeSeconds)
                      return (
                        <tr
                          key={slice.zone}
                          className="border-b border-border-hair last:border-0"
                        >
                          <th scope="row" className="py-2 pr-3 text-left font-normal">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'h-2.5 w-2.5 shrink-0 rounded-[2px]',
                                  zoneFillClass(slice.zone - 1),
                                )}
                              />
                              <span className="leading-snug text-ink-secondary">{slice.label}</span>
                            </span>
                          </th>
                          <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink-secondary">
                            {formatDuration(beforeSeconds)}
                          </td>
                          <td className="py-2 pl-3 text-right whitespace-nowrap">
                            <DeltaBadge value={delta.deltaPct} label={deltaLabel} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong">
                      <th scope="row" className="py-2 pr-3 text-left text-sm font-medium text-ink">
                        Gesamt
                      </th>
                      <td className="tabular px-3 py-2 text-right font-medium whitespace-nowrap text-ink">
                        {formatDuration(previous.totalSec)}
                      </td>
                      <td className="py-2 pl-3 text-right whitespace-nowrap">
                        <DeltaBadge value={totalDelta.deltaPct} label={deltaLabel} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </section>
  )
}
