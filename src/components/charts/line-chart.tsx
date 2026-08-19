'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  AXIS_TICK,
  CHART_MARGIN,
  ChartFrame,
  ChartLegend,
  GRID_COLOR,
  MUTED_COLOR,
  SURFACE_COLOR,
  Y_AXIS_WIDTH,
  hasNumericValues,
  seriesColor,
  textValue,
  useReducedMotion,
} from '@/components/charts/chart-frame'
import type { ChartLegendItem } from '@/components/charts/chart-frame'
import { TOOLTIP_CURSOR, createChartTooltip } from '@/components/charts/tooltip'
import type { TooltipSeriesSpec } from '@/components/charts/tooltip'
import { formatNumber } from '@/lib/format'

/**
 * The trend line: one to three series over time, drawn thin, with the hover
 * layer switched on by default. Gaps stay gaps — `connectNulls` is off, so a
 * day without a measurement leaves a hole instead of a straight lie.
 */

export interface TrendSeries<T> {
  dataKey: Extract<keyof T, string>
  /** German series name — also the legend and tooltip label. */
  label: string
  /** Defaults to the categorical hue for this slot. */
  color?: string
  /** Dashed stroke for derived series such as a rolling average. */
  dashed?: boolean
  /** de-AT formatter for the tooltip value. */
  format?: (value: number) => string
}

export interface TrendBaseline {
  value: number
  /** Half-width of the tolerance band around the baseline, in the y unit. */
  band?: number
  /** German label drawn at the line. Defaults to "Baseline". */
  label?: string
}

export interface TrendLineChartProps<T extends object> {
  data: readonly T[]
  /** Key of the x value — a day key or a week label. */
  xKey: Extract<keyof T, string>
  series: ReadonlyArray<TrendSeries<T>>
  height?: number
  aspect?: number
  /** Axis tick formatters — the page knows the unit, the chart does not. */
  formatX?: (value: string) => string
  formatY?: (value: number) => string
  /** Tooltip heading; defaults to `formatX`. */
  formatTooltipLabel?: (value: string) => string
  /** Fallback tooltip formatter for series without their own. */
  formatValue?: (value: number) => string
  tooltipFootnote?: string
  baseline?: TrendBaseline
  yDomain?: [number | string, number | string]
  yAxisWidth?: number
  /** Hides the x tick row — used by SyncedPanels for all but the last panel. */
  showXAxis?: boolean
  /** Ties this chart to the shared hover of a SyncedPanels group. */
  syncId?: string
  /** Forces the German empty state; otherwise derived from the data. */
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyHint?: string
  /** Accessible name for the plot. */
  label?: string
  className?: string
}

const DASH_PATTERN = '5 4'

export function TrendLineChart<T extends object>({
  data,
  xKey,
  series,
  height,
  aspect,
  formatX,
  formatY,
  formatTooltipLabel,
  formatValue,
  tooltipFootnote,
  baseline,
  yDomain,
  yAxisWidth = Y_AXIS_WIDTH,
  showXAxis = true,
  syncId,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyHint,
  label,
  className,
}: TrendLineChartProps<T>) {
  const reducedMotion = useReducedMotion()

  const keys = series.map((entry) => entry.dataKey)
  const empty = isEmpty ?? (data.length === 0 || !hasNumericValues(data, keys))

  const resolved = series.map((entry, index) => ({
    ...entry,
    color: entry.color ?? seriesColor(index),
  }))

  const tooltipSeries: Array<TooltipSeriesSpec<T>> = resolved.map((entry) => ({
    dataKey: entry.dataKey,
    label: entry.label,
    color: entry.color,
    ...(entry.format === undefined ? {} : { format: entry.format }),
  }))

  const tooltipLabelFormatter = formatTooltipLabel ?? formatX

  const tooltipContent = createChartTooltip<T>({
    series: tooltipSeries,
    ...(tooltipLabelFormatter === undefined ? {} : { formatLabel: tooltipLabelFormatter }),
    ...(formatValue === undefined ? {} : { formatValue }),
    ...(tooltipFootnote === undefined ? {} : { footnote: tooltipFootnote }),
  })

  // A single series is named by the panel title; only two or more need a legend.
  const legendItems: ChartLegendItem[] = resolved.map((entry) => ({
    key: entry.dataKey,
    label: entry.label,
    color: entry.color,
    marker: entry.dashed === true ? 'dashed' : 'line',
  }))

  return (
    <ChartFrame
      {...(height === undefined ? {} : { height })}
      {...(aspect === undefined ? {} : { aspect })}
      isEmpty={empty}
      {...(emptyTitle === undefined ? {} : { emptyTitle })}
      {...(emptyDescription === undefined ? {} : { emptyDescription })}
      {...(emptyHint === undefined ? {} : { emptyHint })}
      {...(label === undefined ? {} : { label })}
      {...(className === undefined ? {} : { className })}
      {...(resolved.length >= 2 ? { legend: <ChartLegend items={legendItems} /> } : {})}
    >
      <LineChart
        data={data}
        margin={CHART_MARGIN}
        {...(syncId === undefined ? {} : { syncId, syncMethod: 'index' as const })}
      >
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />

        <XAxis
          dataKey={xKey}
          hide={!showXAxis}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          {...(formatX === undefined
            ? {}
            : { tickFormatter: (value: unknown) => formatX(textValue(value)) })}
        />

        <YAxis
          width={yAxisWidth}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          {...(yDomain === undefined ? {} : { domain: yDomain })}
          tickFormatter={(value: unknown) =>
            typeof value === 'number' && Number.isFinite(value)
              ? (formatY?.(value) ?? formatNumber(value))
              : ''
          }
        />

        {baseline === undefined ? null : (
          <>
            {baseline.band === undefined ? null : (
              <ReferenceArea
                y1={baseline.value - baseline.band}
                y2={baseline.value + baseline.band}
                fill={MUTED_COLOR}
                fillOpacity={0.1}
                stroke="none"
                ifOverflow="extendDomain"
              />
            )}
            <ReferenceLine
              y={baseline.value}
              stroke={MUTED_COLOR}
              strokeDasharray={DASH_PATTERN}
              strokeWidth={1}
              ifOverflow="extendDomain"
              label={{
                value: baseline.label ?? 'Baseline',
                position: 'insideTopRight',
                fill: MUTED_COLOR,
                fontSize: 11,
              }}
            />
          </>
        )}

        <Tooltip cursor={TOOLTIP_CURSOR} content={tooltipContent} isAnimationActive={false} />

        {resolved.map((entry) => (
          <Line
            key={entry.dataKey}
            type="monotone"
            dataKey={entry.dataKey}
            name={entry.label}
            stroke={entry.color}
            strokeWidth={2}
            {...(entry.dashed === true ? { strokeDasharray: DASH_PATTERN } : {})}
            dot={false}
            activeDot={{ r: 4, fill: entry.color, stroke: SURFACE_COLOR, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={!reducedMotion}
          />
        ))}
      </LineChart>
    </ChartFrame>
  )
}
