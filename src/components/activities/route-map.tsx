import type { ReactElement } from 'react'

import { cn } from '@/lib/cn'

/**
 * The recorded track, drawn as a plain polyline.
 *
 * No tile layer and no map library: the app never sends the user's coordinates
 * to a third party just to draw a line. The shape is the whole point, so the
 * longitudes are scaled by cos(latitude) — otherwise a route in Vienna would
 * come out stretched sideways.
 */

const VIEW_WIDTH = 640
const VIEW_HEIGHT = 360
const PADDING = 14
const MAX_POINTS = 500

export interface RouteMapProps {
  /** [lat, lng] pairs as recorded. */
  latLng: ReadonlyArray<readonly [number, number]>
  /** German description for assistive technology. */
  label?: string
  className?: string
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function thin<T>(values: readonly T[]): T[] {
  const stride = Math.max(1, Math.ceil(values.length / MAX_POINTS))
  const out: T[] = []
  for (let index = 0; index < values.length; index += stride) {
    const value = values[index]
    if (value !== undefined) out.push(value)
  }
  const last = values[values.length - 1]
  // The closing sample matters on a loop; striding must not drop it.
  if (last !== undefined && out[out.length - 1] !== last) out.push(last)
  return out
}

function buildPoints(latLng: ReadonlyArray<readonly [number, number]>): string | null {
  const usable = latLng.filter(
    (pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
  )
  if (usable.length < 2) return null

  const first = usable[0]
  if (first === undefined) return null

  let latSum = 0
  for (const pair of usable) latSum += pair[0]
  const latMean = latSum / usable.length
  const lngScale = Math.cos((latMean * Math.PI) / 180)

  // Local planar coordinates: x east, y north.
  const projected = thin(usable).map((pair): readonly [number, number] => [
    pair[1] * lngScale,
    pair[0],
  ])

  const start = projected[0]
  if (start === undefined) return null

  const bounds: Bounds = { minX: start[0], maxX: start[0], minY: start[1], maxY: start[1] }
  for (const [x, y] of projected) {
    if (x < bounds.minX) bounds.minX = x
    if (x > bounds.maxX) bounds.maxX = x
    if (y < bounds.minY) bounds.minY = y
    if (y > bounds.maxY) bounds.maxY = y
  }

  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  if (spanX <= 0 && spanY <= 0) return null

  const innerWidth = VIEW_WIDTH - PADDING * 2
  const innerHeight = VIEW_HEIGHT - PADDING * 2
  const scale = Math.min(
    spanX > 0 ? innerWidth / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? innerHeight / spanY : Number.POSITIVE_INFINITY,
  )

  const offsetX = PADDING + (innerWidth - spanX * scale) / 2
  const offsetY = PADDING + (innerHeight - spanY * scale) / 2

  return projected
    .map(([x, y]) => {
      const px = offsetX + (x - bounds.minX) * scale
      // SVG y grows downwards, north has to stay up.
      const py = offsetY + (bounds.maxY - y) * scale
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
}

export function RouteMap({
  latLng,
  label = 'Streckenverlauf der Aktivität',
  className,
}: RouteMapProps): ReactElement | null {
  const points = buildPoints(latLng)
  if (points === null) return null

  return (
    <svg
      viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className={cn('h-auto w-full', className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--series-1)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Whether the recorded track yields a drawable line at all. */
export function canRenderRoute(latLng: ReadonlyArray<readonly [number, number]> | null): boolean {
  return latLng !== null && buildPoints(latLng) !== null
}
