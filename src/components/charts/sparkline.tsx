'use client'

import { NO_DATA } from '@/lib/format'
import { SERIES_COLORS } from '@/components/charts/chart-frame'
import { cn } from '@/lib/cn'

/**
 * The 64×20 line that sits under a StatTile: shape only, no axes, no tooltip.
 * Null days break the path instead of being bridged, so a gap stays visible
 * even at this size. Too few points to draw a shape → "keine Daten".
 */

const DEFAULT_WIDTH = 64
const DEFAULT_HEIGHT = 20
const DEFAULT_STROKE = 2

export interface SparklineProps {
  /** One entry per day; null where nothing was measured. */
  values: ReadonlyArray<number | null>
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  /** German description for assistive tech, e.g. "Ruhepuls, letzte 30 Tage". */
  label?: string
  className?: string
}

interface Point {
  x: number
  y: number
}

function buildSegments(
  values: ReadonlyArray<number | null>,
  width: number,
  height: number,
  strokeWidth: number,
): Point[][] {
  const finite: number[] = []
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) finite.push(value)
  }
  if (finite.length < 2 || values.length < 2) return []

  let min = finite[0] ?? 0
  let max = min
  for (const value of finite) {
    if (value < min) min = value
    if (value > max) max = value
  }

  const pad = strokeWidth / 2
  const innerWidth = Math.max(width - strokeWidth, 1)
  const innerHeight = Math.max(height - strokeWidth, 1)
  const span = max - min

  const segments: Point[][] = []
  let current: Point[] = []

  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    const x = pad + (index / (values.length - 1)) * innerWidth
    // A flat series sits on the middle line rather than collapsing to the floor.
    const ratio = span === 0 ? 0.5 : (value - min) / span
    const y = pad + (1 - ratio) * innerHeight
    current.push({ x, y })
  })
  if (current.length > 0) segments.push(current)

  return segments.filter((segment) => segment.length >= 2)
}

function toPath(segment: Point[]): string {
  return segment
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

export function Sparkline({
  values,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  color = SERIES_COLORS[0],
  strokeWidth = DEFAULT_STROKE,
  label,
  className,
}: SparklineProps) {
  const segments = buildSegments(values, width, height, strokeWidth)

  if (segments.length === 0) {
    return <span className={cn('text-xs text-ink-muted', className)}>{NO_DATA}</span>
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className={cn('block overflow-visible', className)}
      {...(label === undefined
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      {segments.map((segment, index) => (
        <path
          key={`segment-${String(index)}`}
          d={toPath(segment)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
