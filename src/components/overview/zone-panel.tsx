'use client'

import { useState, type ReactElement } from 'react'

import { ZoneDistribution } from '@/components/charts/zone-bar'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control'
import type { ZoneAggregate } from '@/lib/analytics/zones'
import type { ZoneKind } from '@/lib/domain/types'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'

/**
 * "Zeit in Trainingszonen" for the running week. Both aggregates are computed
 * on the server and handed over complete, so the toggle only swaps which one is
 * shown — no recomputation, no second request, and a kind without zone data
 * keeps its own empty state instead of borrowing the other one's numbers.
 */

const ZONE_OPTIONS: ReadonlyArray<SegmentedOption<ZoneKind>> = [
  { value: 'heart_rate', label: 'Herzfrequenz' },
  { value: 'power', label: 'Leistung' },
]

const EMPTY_DESCRIPTIONS: Record<ZoneKind, string> = {
  heart_rate: 'Für diese Woche liegen keine Herzfrequenzzonen vor',
  power: 'Für diese Woche liegen keine Leistungszonen vor',
}

export interface ZonePanelProps {
  heartRate: ZoneAggregate
  power: ZoneAggregate
  className?: string
}

export function ZonePanel({ heartRate, power, className }: ZonePanelProps): ReactElement {
  const [kind, setKind] = useState<ZoneKind>('heart_rate')
  const aggregate = kind === 'power' ? power : heartRate

  return (
    <Card aria-labelledby="zonen-titel" className={cn(className)}>
      <CardHeader
        id="zonen-titel"
        title="Zeit in Trainingszonen"
        hint={
          aggregate.hasData
            ? `Diese Woche · ${formatDuration(aggregate.totalSec)}`
            : 'Diese Woche'
        }
        action={
          <SegmentedControl
            options={ZONE_OPTIONS}
            value={kind}
            onChange={setKind}
            label="Messgröße"
            size="sm"
          />
        }
      />
      <CardBody>
        <ZoneDistribution
          slices={aggregate.slices}
          totalSec={aggregate.totalSec}
          hasData={aggregate.hasData}
          label="Zeit in Trainingszonen, diese Woche"
          emptyTitle="Keine Zonendaten"
          emptyDescription={EMPTY_DESCRIPTIONS[kind]}
        />
      </CardBody>
    </Card>
  )
}
