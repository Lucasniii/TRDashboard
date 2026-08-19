import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** The two wordings the app uses when a query legitimately returns nothing. */
export const EMPTY_NO_ACTIVITIES = 'Keine Aktivitäten in diesem Zeitraum'
export const EMPTY_NO_DATA = 'Für diesen Zeitraum liegen keine Daten vor'

export interface EmptyStateProps {
  /** German headline. Defaults to the generic "no data in range" wording. */
  title?: string
  /** One sentence explaining why nothing is shown. */
  description?: string
  /** Quieter follow-up, e.g. what the user could try next. */
  hint?: string
  /** Slot for a link or button. */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title = EMPTY_NO_DATA,
  description,
  hint,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-hair px-5 py-10 text-center',
        className,
      )}
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-prose text-sm text-ink-secondary">{description}</p>
      )}
      {hint === undefined ? null : <p className="max-w-prose text-xs text-ink-muted">{hint}</p>}
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  )
}
