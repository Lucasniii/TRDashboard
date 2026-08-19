'use client'

import { seriesColor } from '@/components/charts/chart-frame'
import {
  MAX_TREND_METRICS,
  TREND_METRICS,
  TREND_METRIC_GROUPS,
  type TrendMetricId,
} from '@/components/trends/metrics'
import { cn } from '@/lib/cn'

/**
 * Two groups of toggles, at most three of them on at a time. The swatch on a
 * selected chip carries the colour its panel is drawn in, so the picker and the
 * plots below stay one object rather than two lists that happen to agree.
 */

const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-plane'

const LIMIT_HINT = 'Höchstens drei Messgrößen gleichzeitig'

export interface MetricPickerProps {
  /** Selection order decides the panel order and therefore the colours. */
  selected: readonly TrendMetricId[]
  onToggle: (id: TrendMetricId) => void
  className?: string
}

export function MetricPicker({ selected, onToggle, className }: MetricPickerProps) {
  const atLimit = selected.length >= MAX_TREND_METRICS

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {TREND_METRIC_GROUPS.map((group) => {
        const headingId = `messgroessen-${group.id}`
        return (
          <div key={group.id} className="flex flex-col gap-2.5">
            <h3
              id={headingId}
              className="text-xs font-semibold tracking-wide text-ink-secondary uppercase"
            >
              {group.label}
            </h3>
            <div role="group" aria-labelledby={headingId} className="flex flex-wrap gap-2">
              {group.metrics.map((id) => {
                const metric = TREND_METRICS[id]
                const position = selected.indexOf(id)
                const isSelected = position >= 0
                const isDisabled = !isSelected && atLimit
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isDisabled}
                    {...(isDisabled ? { title: LIMIT_HINT } : {})}
                    onClick={() => {
                      onToggle(id)
                    }}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      isSelected
                        ? 'border-border-strong bg-surface-2 font-medium text-ink'
                        : 'border-border-hair bg-surface text-ink-secondary hover:text-ink enabled:hover:bg-surface-2',
                      FOCUS_RING,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: isSelected ? seriesColor(position) : 'var(--axis)',
                      }}
                    />
                    <span>{metric.label}</span>
                    {metric.unit === null ? null : (
                      <span className="text-xs text-ink-muted">{metric.unit}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <p aria-live="polite" className="text-xs text-ink-muted">
        {selected.length} von {MAX_TREND_METRICS} Messgrößen ausgewählt · jede bekommt ein eigenes
        Panel mit eigener Skala und Einheit.
      </p>
    </div>
  )
}
