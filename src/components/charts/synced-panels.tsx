'use client'

import { useId } from 'react'

import { TrendLineChart } from '@/components/charts/line-chart'
import type { TrendBaseline, TrendSeries } from '@/components/charts/line-chart'
import { Y_AXIS_WIDTH } from '@/components/charts/chart-frame'
import { cn } from '@/lib/cn'

/**
 * Two metrics of different scale are compared by stacking two plots that share
 * one x-axis and one hover — never by a second y-axis. A dual-axis chart lets
 * the author choose where the curves cross, which is a claim, not a reading.
 */

export interface SyncedPanel<T extends object> {
  key: string
  /** German panel title, e.g. "Ruhepuls". */
  title: string
  /** German unit shown beside the title, e.g. "bpm". */
  unit?: string
  series: ReadonlyArray<TrendSeries<T>>
  height?: number
  formatY?: (value: number) => string
  formatValue?: (value: number) => string
  yDomain?: [number | string, number | string]
  baseline?: TrendBaseline
  /** Forces this panel's German empty state. */
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  /** Quiet note under the title, e.g. "berechnet". */
  hint?: string
}

export interface SyncedPanelsProps<T extends object> {
  data: readonly T[]
  /** Key of the shared x value — every panel plots against it. */
  xKey: Extract<keyof T, string>
  panels: ReadonlyArray<SyncedPanel<T>>
  /** Shared hover group. Defaults to a generated id, one per component. */
  syncId?: string
  formatX?: (value: string) => string
  formatTooltipLabel?: (value: string) => string
  /** Same gutter on every panel, otherwise the x positions drift apart. */
  yAxisWidth?: number
  panelHeight?: number
  className?: string
}

const DEFAULT_PANEL_HEIGHT = 160

export function SyncedPanels<T extends object>({
  data,
  xKey,
  panels,
  syncId,
  formatX,
  formatTooltipLabel,
  yAxisWidth = Y_AXIS_WIDTH,
  panelHeight = DEFAULT_PANEL_HEIGHT,
  className,
}: SyncedPanelsProps<T>) {
  const generatedId = useId()
  const group = syncId ?? generatedId

  return (
    <div className={cn('flex min-w-0 flex-col gap-5', className)}>
      {panels.map((panel, index) => {
        const isLast = index === panels.length - 1
        return (
          <section key={panel.key} className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h4 className="text-sm font-semibold tracking-tight text-ink">{panel.title}</h4>
              {panel.unit === undefined ? null : (
                <span className="text-xs text-ink-muted">{panel.unit}</span>
              )}
              {panel.hint === undefined ? null : (
                <span className="text-xs text-ink-muted">· {panel.hint}</span>
              )}
            </div>

            <TrendLineChart<T>
              data={data}
              xKey={xKey}
              series={panel.series}
              height={panel.height ?? panelHeight}
              syncId={group}
              // Only the bottom panel carries the tick row; the axis above it
              // is the same scale, so repeating the labels would be noise.
              showXAxis={isLast}
              yAxisWidth={yAxisWidth}
              label={panel.title}
              {...(formatX === undefined ? {} : { formatX })}
              {...(formatTooltipLabel === undefined ? {} : { formatTooltipLabel })}
              {...(panel.formatY === undefined ? {} : { formatY: panel.formatY })}
              {...(panel.formatValue === undefined ? {} : { formatValue: panel.formatValue })}
              {...(panel.yDomain === undefined ? {} : { yDomain: panel.yDomain })}
              {...(panel.baseline === undefined ? {} : { baseline: panel.baseline })}
              {...(panel.isEmpty === undefined ? {} : { isEmpty: panel.isEmpty })}
              {...(panel.emptyTitle === undefined ? {} : { emptyTitle: panel.emptyTitle })}
              {...(panel.emptyDescription === undefined
                ? {}
                : { emptyDescription: panel.emptyDescription })}
            />
          </section>
        )
      })}
    </div>
  )
}
