import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The surface every panel in the app sits on: one hairline border, no shadow,
 * no gradient. Vertical rhythm between header and body comes from the flex gap,
 * so a card without a header carries no stray spacing.
 */

export type CardProps = ComponentPropsWithoutRef<'div'>

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border-hair bg-surface p-5 sm:gap-5 sm:p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  /** Secondary line under the title — context, period, unit. */
  hint?: ReactNode
  /** Right-hand slot for a segmented control, a badge or a link. */
  action?: ReactNode
  /** Set together with aria-labelledby on the Card when the panel needs a name. */
  id?: string
  as?: 'h2' | 'h3' | 'h4'
  className?: string
}

export function CardHeader({ title, hint, action, id, as = 'h3', className }: CardHeaderProps) {
  const Heading = as as ElementType
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <Heading id={id} className="text-base font-semibold tracking-tight text-ink">
          {title}
        </Heading>
        {hint === undefined ? null : <p className="mt-1 text-sm text-ink-secondary">{hint}</p>}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  )
}

export type CardBodyProps = ComponentPropsWithoutRef<'div'>

export function CardBody({ className, children, ...rest }: CardBodyProps) {
  // min-w-0 keeps wide children (charts, tables) from stretching the card.
  return (
    <div className={cn('min-w-0', className)} {...rest}>
      {children}
    </div>
  )
}
