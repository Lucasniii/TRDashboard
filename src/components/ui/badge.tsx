import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'info'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border-hair bg-surface-2 text-ink-secondary',
  good: 'border-good/25 bg-good/10 text-good',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  serious: 'border-serious/30 bg-serious/10 text-serious',
  critical: 'border-critical/25 bg-critical/10 text-critical',
  info: 'border-series-1/25 bg-series-1/10 text-series-1',
}

export interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  /** Tooltip for abbreviated labels. */
  title?: string
  className?: string
}

export function Badge({ children, tone = 'neutral', title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
