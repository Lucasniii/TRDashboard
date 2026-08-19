'use client'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import type { LabelListEntry } from 'recharts'

import {
  AXIS_TICK,
  CHART_MARGIN,
  ChartFrame,
  GRID_COLOR,
  INK_COLOR,
  SERIES_COLORS,
  Y_AXIS_WIDTH,
  booleanValue,
  hasNumericValues,
  numericValue,
  textValue,
  useReducedMotion,
} from '@/components/charts/chart-frame'
import { BAR_TOOLTIP_CURSOR, createChartTooltip } from '@/components/charts/tooltip'
import { formatNumber } from '@/lib/format'

/**
 * Weekly volume bars. One series, so no legend — the panel title names it. The
 * running week is emphasised by opacity plus its own direct label, never by a
 * second hue: colour alone would make the emphasis invisible to some readers.
 */

const PAST_WEEK_OPACITY = 0.45

export interface VolumeBarChartProps<T extends object> {
  data: readonly T[]
  /** Key of the category value, e.g. the "KW 34" week label. */
  xKey: Extract<keyof T, string>
  valueKey: Extract<keyof T, string>
  /** Boolean key marking the emphasised bar — the current, incomplete week. */
  emphasisKey?: Extract<keyof T, string>
  /** German series name for the tooltip row. */
  label: string
  color?: string
  /** de-AT formatter for the tooltip and the direct label on the current bar. */
  formatValue?: (value: number) => string
  formatY?: (value: number) => string
  formatX?: (value: string) => string
  formatTooltipLabel?: (value: string) => string
  tooltipFootnote?: string
  height?: number
  aspect?: number
  yAxisWidth?: number
  /** Forces the German empty state; otherwise derived from the data. */
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyHint?: string
  /** Accessible name for the plot. */
  chartLabel?: string
  className?: string
}

export function VolumeBarChart<T extends object>({
  data,
  xKey,
  valueKey,
  emphasisKey,
  label,
  color = SERIES_COLORS[0],
  formatValue,
  formatY,
  formatX,
  formatTooltipLabel,
  tooltipFootnote,
  height,
  aspect,
  yAxisWidth = Y_AXIS_WIDTH,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyHint,
  chartLabel,
  className,
}: VolumeBarChartProps<T>) {
  const reducedMotion = useReducedMotion()

  const empty = isEmpty ?? (data.length === 0 || !hasNumericValues(data, [valueKey]))

  const formatBarValue = formatValue ?? ((value: number) => formatNumber(value))

  const tooltipLabelFormatter = formatTooltipLabel ?? formatX

  const tooltipContent = createChartTooltip<T>({
    series: [{ dataKey: valueKey, label, color, format: formatBarValue }],
    ...(tooltipLabelFormatter === undefined ? {} : { formatLabel: tooltipLabelFormatter }),
    ...(tooltipFootnote === undefined ? {} : { footnote: tooltipFootnote }),
  })

  const isEmphasised = (row: unknown): boolean =>
    emphasisKey !== undefined && booleanValue(row, emphasisKey)

  /** Only the emphasised bar carries a number; the rest read off the axis. */
  const directLabel = (entry: LabelListEntry): string | null => {
    const row: unknown = entry.payload
    if (!isEmphasised(row)) return null
    const value = numericValue(row, valueKey)
    return value === null ? null : formatBarValue(value)
  }

  return (
    <ChartFrame
      {...(height === undefined ? {} : { height })}
      {...(aspect === undefined ? {} : { aspect })}
      isEmpty={empty}
      {...(emptyTitle === undefined ? {} : { emptyTitle })}
      {...(emptyDescription === undefined ? {} : { emptyDescription })}
      {...(emptyHint === undefined ? {} : { emptyHint })}
      {...(chartLabel === undefined ? {} : { label: chartLabel })}
      {...(className === undefined ? {} : { className })}
    >
      {/* barCategoryGap 2 keeps a 2px surface gap between neighbouring bars. */}
      <BarChart data={data} margin={CHART_MARGIN} barCategoryGap={2}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="0" vertical={false} />

        <XAxis
          dataKey={xKey}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={8}
          interval="preserveStartEnd"
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
          tickFormatter={(value: unknown) =>
            typeof value === 'number' && Number.isFinite(value)
              ? (formatY?.(value) ?? formatNumber(value))
              : ''
          }
        />

        <Tooltip cursor={BAR_TOOLTIP_CURSOR} content={tooltipContent} isAnimationActive={false} />

        <Bar
          dataKey={valueKey}
          name={label}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          isAnimationActive={!reducedMotion}
        >
          {data.map((row, index) => (
            <Cell
              key={`bar-${String(index)}`}
              fill={color}
              fillOpacity={isEmphasised(row) ? 1 : PAST_WEEK_OPACITY}
            />
          ))}
          <LabelList
            position="top"
            offset={8}
            fill={INK_COLOR}
            fontSize={12}
            className="tabular"
            valueAccessor={directLabel}
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}
