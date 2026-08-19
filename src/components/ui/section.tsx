import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface PageHeaderProps {
  /** German page title, e.g. "Übersicht". */
  title: string
  /** One line of context under the title, e.g. the active date range. */
  subline?: string
  /** Right-hand slot for a period picker or a sync button. */
  action?: ReactNode
  className?: string
}

export function PageHeader({ title, subline, action, className }: PageHeaderProps) {
  return (
    <header
      className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subline === undefined ? null : (
          <p className="mt-1 text-sm text-ink-secondary">{subline}</p>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </header>
  )
}

export interface SectionHeadingProps {
  title: string
  description?: string
  action?: ReactNode
  /** Pair with aria-labelledby on the surrounding section. */
  id?: string
  className?: string
}

export function SectionHeading({ title, description, action, id, className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="mt-1 text-sm text-ink-secondary">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  )
}
