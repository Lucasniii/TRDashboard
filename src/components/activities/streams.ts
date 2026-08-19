import type { ActivityStreams } from '@/lib/domain/types'

/**
 * Turns the per-sample streams of one activity into the row shape the synced
 * chart panels read.
 *
 * Long rides carry thousands of samples, so the series is thinned by taking
 * every n-th recorded sample. Nothing is averaged, smoothed or interpolated —
 * every plotted point is a value the device actually recorded, and the panel
 * says out loud how far apart the plotted points are.
 */

export type StreamKey = 'power' | 'heartRate' | 'speed' | 'altitude' | 'cadence'

export interface StreamPoint {
  /** Seconds since the start of the activity — the shared x-axis. */
  timeSec: number
  power: number | null
  heartRate: number | null
  speedKmh: number | null
  altitudeM: number | null
  cadence: number | null
}

export interface StreamSeries {
  points: StreamPoint[]
  /** Which panels have data, in display order. */
  keys: StreamKey[]
  /** Seconds between two plotted points, null when there is nothing to plot. */
  intervalSec: number | null
}

const MAX_POINTS = 600

function sample(values: readonly number[] | null, index: number): number | null {
  if (values === null) return null
  const value = values[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function hasValues(points: readonly StreamPoint[], read: (point: StreamPoint) => number | null): boolean {
  return points.some((point) => read(point) !== null)
}

export function buildStreamSeries(streams: ActivityStreams | null): StreamSeries {
  if (streams === null || streams.timeSec.length === 0) {
    return { points: [], keys: [], intervalSec: null }
  }

  const count = streams.timeSec.length
  const stride = Math.max(1, Math.ceil(count / MAX_POINTS))

  const points: StreamPoint[] = []
  for (let index = 0; index < count; index += stride) {
    const timeSec = streams.timeSec[index]
    if (timeSec === undefined) continue
    const speedMps = sample(streams.speedMps, index)
    points.push({
      timeSec,
      power: sample(streams.power, index),
      heartRate: sample(streams.heartRate, index),
      speedKmh: speedMps === null ? null : Math.round(speedMps * 3.6 * 10) / 10,
      altitudeM: sample(streams.altitudeM, index),
      cadence: sample(streams.cadence, index),
    })
  }

  const keys: StreamKey[] = []
  if (hasValues(points, (point) => point.power)) keys.push('power')
  if (hasValues(points, (point) => point.heartRate)) keys.push('heartRate')
  if (hasValues(points, (point) => point.speedKmh)) keys.push('speed')
  if (hasValues(points, (point) => point.altitudeM)) keys.push('altitude')
  if (hasValues(points, (point) => point.cadence)) keys.push('cadence')

  const first = points[0]
  const second = points[1]
  const intervalSec =
    first === undefined || second === undefined ? null : second.timeSec - first.timeSec

  return { points, keys, intervalSec }
}
