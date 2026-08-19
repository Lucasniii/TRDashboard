'use client'

import type { ReactElement } from 'react'

import { zoneFillClass } from '@/components/charts/chart-frame'
import { EmptyState } from '@/components/ui/empty-state'
import type { SleepStages } from '@/lib/domain/types'
import { formatDuration, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The stages of one night as a plain stacked bar — built exactly like
 * ZoneDistribution: no chart runtime for four segments, an ordinal ramp from
 * deep to awake, and a legend below that carries the real minutes, so nothing
 * has to be decoded by colour alone.
 *
 * A night the provider reported without a stage breakdown is not reconstructed
 * from its total duration; it simply shows the empty state.
 */

const SEGMENT_GAP = 2

interface StageSpec {
  key: keyof SleepStages
  /** German stage name. */
  label: string
  /** Slot in the ordinal zone ramp — deepest sleep gets the darkest step. */
  rampIndex: number
}

const STAGE_ORDER: readonly StageSpec[] = [
  { key: 'deepSec', label: 'Tiefschlaf', rampIndex: 4 },
  { key: 'remSec', label: 'REM', rampIndex: 3 },
  { key: 'lightSec', label: 'Leichtschlaf', rampIndex: 2 },
  { key: 'awakeSec', label: 'Wach', rampIndex: 0 },
]

interface StageSlice {
  label: string
  seconds: number
  fillClass: string
}

export interface SleepStageBarProps {
  /** Stages of the night, or null when the provider delivered none. */
  stages: SleepStages | null
  /** Accessible name for the bar, e.g. "Schlafphasen der letzten Nacht". */
  label?: string
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

export function SleepStageBar({
  stages,
  label,
  emptyTitle,
  emptyDescription,
  className,
}: SleepStageBarProps): ReactElement {
  const slices: StageSlice[] =
    stages === null
      ? []
      : STAGE_ORDER.map((spec) => {
          const seconds = stages[spec.key]
          return {
            label: spec.label,
            seconds: Number.isFinite(seconds) ? seconds : 0,
            fillClass: zoneFillClass(spec.rampIndex),
          }
        })

  let total = 0
  for (const slice of slices) total += slice.seconds

  if (total <= 0) {
    return (
      <EmptyState
        title={emptyTitle ?? 'Keine Schlafphasen'}
        description={emptyDescription ?? 'Für diese Nacht liegt keine Phasenaufteilung vor'}
        {...(className === undefined ? {} : { className })}
      />
    )
  }

  const visible = slices.filter((slice) => slice.seconds > 0)

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface"
        style={{ gap: SEGMENT_GAP }}
        {...(label === undefined ? {} : { role: 'img', 'aria-label': label })}
      >
        {visible.map((slice) => (
          <div
            key={slice.label}
            // The gap lets the surface show through as a 2px spacer.
            className={cn('h-full min-w-0', slice.fillClass)}
            style={{ flexGrow: slice.seconds / total, flexBasis: 0 }}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {slices.map((slice) => (
          <li
            key={slice.label}
            className="grid grid-cols-[0.625rem_minmax(0,1fr)_auto_3.25rem] items-center gap-x-2 text-sm"
          >
            <span
              aria-hidden="true"
              className={cn('h-2.5 w-2.5 rounded-[2px]', slice.fillClass)}
            />
            <span className="leading-snug text-ink-secondary">{slice.label}</span>
            <span className="tabular text-right text-ink">{formatDuration(slice.seconds)}</span>
            <span className="tabular text-right text-ink-muted">
              {formatPercent((slice.seconds / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
