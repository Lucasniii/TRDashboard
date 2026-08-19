import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/cn'

/** Placeholder block for Suspense fallbacks. Height comes from the caller. */

export type SkeletonProps = ComponentPropsWithoutRef<'div'>

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      {...rest}
    />
  )
}
