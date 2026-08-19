'use client'

import { useRouter } from 'next/navigation'
import { useTransition, type ReactElement } from 'react'

import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  HEALTH_PERIOD_OPTIONS,
  PERIOD_PARAM,
  type HealthPeriod,
} from '@/components/health/health-metrics'
import { cn } from '@/lib/cn'

/**
 * The period picker owns nothing but the URL: the selected range lives in
 * ?zeitraum=, the server recomputes every series from it, and a reload or a
 * shared link lands on the same view. `replace` keeps the history clean.
 */

export interface PeriodFilterProps {
  value: HealthPeriod
  /** Route the query is written back to. */
  pathname?: string
  className?: string
}

export function PeriodFilter({
  value,
  pathname = '/gesundheit',
  className,
}: PeriodFilterProps): ReactElement {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleChange(next: HealthPeriod): void {
    if (next === value) return
    startTransition(() => {
      router.replace(`${pathname}?${PERIOD_PARAM}=${next}`, { scroll: false })
    })
  }

  return (
    <div
      aria-busy={isPending}
      className={cn(isPending ? 'opacity-60 transition-opacity' : undefined, className)}
    >
      <SegmentedControl
        options={HEALTH_PERIOD_OPTIONS}
        value={value}
        onChange={handleChange}
        label="Zeitraum"
        size="sm"
      />
    </div>
  )
}
