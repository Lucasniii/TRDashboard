'use client'

import { useState, type ReactElement } from 'react'

import { VolumeBarChart } from '@/components/charts/bar-chart'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control'
import {
  VOLUME_METRIC_LABELS,
  type VolumeMetric,
  type WeeklyVolumePoint,
} from '@/lib/analytics/trends'
import { cn } from '@/lib/cn'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatKm,
  formatNumber,
} from '@/lib/format'

/**
 * Weekly training volume over the last twelve weeks. The four metrics share one
 * set of bars, so switching between them only changes which key is read — the
 * week labels and the emphasis on the running week stay put.
 */

const HISTORY_WEEKS = 12
const CHART_HEIGHT = 260

const METRIC_OPTIONS: ReadonlyArray<SegmentedOption<VolumeMetric>> = [
  { value: 'duration', label: VOLUME_METRIC_LABELS.duration },
  { value: 'distance', label: VOLUME_METRIC_LABELS.distance },
  { value: 'elevation', label: VOLUME_METRIC_LABELS.elevation },
  { value: 'load', label: VOLUME_METRIC_LABELS.load },
]

interface MetricConfig {
  /** Unit line under the panel title — the axis carries bare numbers. */
  hint: string
  formatValue: (value: number) => string
  formatY: (value: number) => string
}

const METRIC_CONFIG: Record<VolumeMetric, MetricConfig> = {
  duration: {
    hint: 'Stunden pro Woche',
    formatValue: (value) => formatDuration(value),
    formatY: (value) => formatNumber(value / 3600),
  },
  distance: {
    hint: 'Kilometer pro Woche',
    formatValue: (value) => formatDistance(value),
    formatY: (value) => formatKm(value),
  },
  elevation: {
    hint: 'Höhenmeter pro Woche',
    formatValue: (value) => formatElevation(value),
    formatY: (value) => formatNumber(value),
  },
  load: {
    hint: 'Trainingsbelastung pro Woche',
    formatValue: (value) => formatNumber(value),
    formatY: (value) => formatNumber(value),
  },
}

export interface VolumePanelProps {
  points: readonly WeeklyVolumePoint[]
  className?: string
}

export function VolumePanel({ points, className }: VolumePanelProps): ReactElement {
  const [metric, setMetric] = useState<VolumeMetric>('duration')
  const config = METRIC_CONFIG[metric]
  const label = VOLUME_METRIC_LABELS[metric]

  return (
    <Card aria-labelledby="volumen-titel" className={cn(className)}>
      <CardHeader
        id="volumen-titel"
        title="Trainingsvolumen"
        hint={`Letzte ${String(HISTORY_WEEKS)} Wochen · ${config.hint}`}
        action={
          <SegmentedControl
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
            label="Kennzahl"
            size="sm"
          />
        }
      />
      <CardBody>
        <VolumeBarChart
          data={points}
          xKey="weekLabel"
          valueKey={metric}
          emphasisKey="isCurrent"
          label={label}
          formatValue={config.formatValue}
          formatY={config.formatY}
          height={CHART_HEIGHT}
          emptyTitle={`Keine ${label}`}
          emptyDescription={`Für die letzten ${String(HISTORY_WEEKS)} Wochen liegen dazu keine Werte vor`}
          chartLabel={`${label} je Woche, letzte ${String(HISTORY_WEEKS)} Wochen`}
        />
      </CardBody>
    </Card>
  )
}
