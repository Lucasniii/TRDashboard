import { NO_DATA } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * Weekly goal progress. The track is the goal, so a week beyond the goal fills
 * the whole track and gets a small notch near the end instead of overflowing.
 */

export interface ProgressBarProps {
  /** German label, e.g. "Trainingszeit diese Woche". */
  label: string
  /** Reached amount in the metric's own unit. null when unknown. */
  value: number | null
  /** Goal in the same unit. null when no goal is set. */
  max: number | null
  /** Formatted readout on the right, e.g. "11:42 / 15:00 h". */
  readout?: string
  className?: string
}

export function ProgressBar({ label, value, max, readout, className }: ProgressBarProps) {
  const hasValues =
    value !== null &&
    max !== null &&
    Number.isFinite(value) &&
    Number.isFinite(max) &&
    max > 0

  const percent = hasValues ? Math.max(0, (value / max) * 100) : 0
  const isOver = percent > 100
  const fill = Math.min(percent, 100)
  const valueText = readout ?? NO_DATA

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-ink-secondary">{label}</span>
        <span className={cn('shrink-0 text-sm font-medium tabular', hasValues ? 'text-ink' : 'text-ink-muted')}>
          {valueText}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={hasValues ? max : undefined}
        aria-valuenow={hasValues ? value : undefined}
        aria-valuetext={valueText}
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {hasValues ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-series-1"
            style={{ width: `${fill}%` }}
          />
        ) : null}
        {isOver ? (
          // Subtle notch: the goal was passed, the bar simply cannot show more.
          <span aria-hidden="true" className="absolute inset-y-0 right-1 w-0.5 rounded-full bg-surface-2" />
        ) : null}
      </div>
    </div>
  )
}
