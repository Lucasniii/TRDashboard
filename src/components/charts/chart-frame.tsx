'use client'

import { useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/cn'

/**
 * The shell every chart in the app sits in: one height, one set of margins, one
 * empty state. Charts stay dumb about layout, and a panel without data shows a
 * sentence instead of an axis-only skeleton pretending to be a chart.
 */

/** Categorical hues in fixed order — never cycled, never reassigned by rank. */
export const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const

/** Ordinal ramp for training zones 1..5. */
export const ZONE_COLORS = [
  'var(--zone-1)',
  'var(--zone-2)',
  'var(--zone-3)',
  'var(--zone-4)',
  'var(--zone-5)',
] as const

/** Written out so Tailwind sees the literals; never built by string concatenation. */
export const ZONE_FILL_CLASSES = [
  'bg-zone-1',
  'bg-zone-2',
  'bg-zone-3',
  'bg-zone-4',
  'bg-zone-5',
] as const

export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const

export const GRID_COLOR = 'var(--grid)'
export const AXIS_COLOR = 'var(--axis)'
export const SURFACE_COLOR = 'var(--surface-1)'
export const MUTED_COLOR = 'var(--text-muted)'
export const INK_COLOR = 'var(--text-primary)'

/** Axis ticks: muted, 12px, tabular so the digits line up column-wise. */
export const AXIS_TICK = {
  fill: MUTED_COLOR,
  fontSize: 12,
  className: 'tabular',
} as const

/** Shared y-axis gutter — synced panels only line up when every panel uses it. */
export const Y_AXIS_WIDTH = 48

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0]
}

export function zoneColor(index: number): string {
  return ZONE_COLORS[index] ?? ZONE_COLORS[0]
}

export function zoneFillClass(index: number): string {
  return ZONE_FILL_CLASSES[index] ?? ZONE_FILL_CLASSES[0]
}

// ── reduced motion ───────────────────────────────────────────────────────────

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (!canMatchMedia()) return () => {}
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readReducedMotion(): boolean {
  if (!canMatchMedia()) return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Server render assumes motion is allowed so the markup matches; the first
 * client commit corrects it. Charts pass the result to isAnimationActive.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotion, readReducedMotion, () => false)
}

// ── data helpers ─────────────────────────────────────────────────────────────

/**
 * A row array is not enough — a range full of null measurements is still empty.
 * Nothing here fills a gap; it only decides between chart and empty state.
 */
export function hasNumericValues<T extends object>(
  data: readonly T[],
  keys: ReadonlyArray<Extract<keyof T, string>>,
): boolean {
  for (const row of data) {
    for (const key of keys) {
      const value = row[key]
      if (typeof value === 'number' && Number.isFinite(value)) return true
    }
  }
  return false
}

/** Reads one numeric cell. Anything that is not a finite number stays null. */
export function numericValue(row: unknown, key: string): number | null {
  if (typeof row !== 'object' || row === null) return null
  const value = (row as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Reads one boolean flag, e.g. "this is the current, still incomplete week". */
export function booleanValue(row: unknown, key: string): boolean {
  if (typeof row !== 'object' || row === null) return false
  return (row as Record<string, unknown>)[key] === true
}

/** Axis and tooltip labels arrive as unknown from Recharts; normalise to text. */
export function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

// ── legend ───────────────────────────────────────────────────────────────────

export type ChartLegendMarker = 'line' | 'rect' | 'dot' | 'dashed'

export interface ChartLegendItem {
  key: string
  /** German series name. */
  label: string
  color: string
  marker?: ChartLegendMarker
  /** Optional direct readout beside the name, already formatted. */
  value?: string
}

export interface ChartLegendProps {
  items: readonly ChartLegendItem[]
  className?: string
}

function markerClass(marker: ChartLegendMarker): string {
  if (marker === 'rect') return 'h-2.5 w-2.5 rounded-[2px]'
  if (marker === 'dot') return 'h-2 w-2 rounded-full'
  if (marker === 'dashed') return 'h-[2px] w-3.5 rounded-full opacity-60'
  return 'h-[2px] w-3.5 rounded-full'
}

/**
 * Two or more series always get a legend — identity never rides on colour
 * alone. The label wears an ink token; only the marker carries the hue.
 */
export function ChartLegend({ items, className }: ChartLegendProps) {
  if (items.length === 0) return null
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-ink-secondary">
          <span
            aria-hidden="true"
            className={cn('shrink-0', markerClass(item.marker ?? 'line'))}
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
          {item.value === undefined ? null : <span className="tabular text-ink">{item.value}</span>}
        </li>
      ))}
    </ul>
  )
}

// ── frame ────────────────────────────────────────────────────────────────────

export interface ChartFrameProps {
  /** Exactly one Recharts chart element. */
  children: ReactElement
  /** Plot height in px. Ignored when `aspect` is set. */
  height?: number
  /** width / height. Set instead of `height` for a chart that scales with its column. */
  aspect?: number
  /** Renders the German empty state instead of the plot. */
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyHint?: string
  emptyAction?: ReactNode
  /** Legend row, drawn above the plot. */
  legend?: ReactNode
  /** Accessible name for the plot region. */
  label?: string
  className?: string
}

export const DEFAULT_CHART_HEIGHT = 240

export function ChartFrame({
  children,
  height = DEFAULT_CHART_HEIGHT,
  aspect,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  emptyHint,
  emptyAction,
  legend,
  label,
  className,
}: ChartFrameProps) {
  const plotStyle: CSSProperties = aspect === undefined ? { height } : { minHeight: 0 }
  // The empty state keeps the panel's height so a later load does not jump.
  const emptyStyle: CSSProperties = {
    minHeight: aspect === undefined ? height : DEFAULT_CHART_HEIGHT,
  }

  if (isEmpty) {
    return (
      <div className={cn('flex w-full min-w-0 flex-col', className)} style={emptyStyle}>
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          hint={emptyHint}
          action={emptyAction}
          className="h-full flex-1"
        />
      </div>
    )
  }

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
      {legend}
      <div
        className="w-full min-w-0"
        style={plotStyle}
        {...(label === undefined ? {} : { role: 'figure', 'aria-label': label })}
      >
        {aspect === undefined ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" aspect={aspect}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
