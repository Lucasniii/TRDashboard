import type { ReactNode } from 'react'

import { DeltaBadge } from '@/components/ui/delta-badge'
import { NO_DATA } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * One headline number. The value arrives pre-formatted from src/lib/format,
 * because only the caller knows which unit and precision the metric needs.
 * A missing metric shows "keine Daten" — it is never filled with a zero.
 */

export interface StatTileProps {
  /** German metric name, e.g. "Kilometer diese Woche". */
  label: string
  /** Formatted value, or null when the metric is missing. */
  value: string | null
  /** Unit set beside the value when it is not already part of it. */
  unit?: string
  /** Relative change in percent; omit the prop to hide the badge entirely. */
  delta?: number | null
  deltaLabel?: string
  /** Lower is better (Ruhepuls). */
  deltaInvert?: boolean
  /** Sparkline or any small inline visual under the value. */
  children?: ReactNode
  footnote?: string
  className?: string
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  deltaInvert = false,
  children,
  footnote,
  className,
}: StatTileProps) {
  const hasValue = value !== null && value.length > 0

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {hasValue ? (
          <>
            {/* Hero numbers stay proportional — no .tabular here. */}
            <span className="text-3xl font-semibold leading-none tracking-tight text-ink sm:text-4xl">
              {value}
            </span>
            {unit === undefined ? null : (
              <span className="text-sm text-ink-secondary">{unit}</span>
            )}
          </>
        ) : (
          <span className="text-lg font-medium text-ink-muted sm:text-xl">{NO_DATA}</span>
        )}

        {delta === undefined || !hasValue ? null : (
          <DeltaBadge value={delta} label={deltaLabel} invert={deltaInvert} />
        )}
      </div>

      {children === undefined ? null : <div className="min-w-0">{children}</div>}

      {footnote === undefined ? null : <p className="text-xs text-ink-muted">{footnote}</p>}
    </div>
  )
}
