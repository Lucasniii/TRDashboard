import type { ReactElement } from 'react'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/cn'
import type { GoalProgress } from '@/lib/analytics/weekly'

/**
 * "Wochenfortschritt": the week's totals against the goals from the settings.
 * A goal that is not set shows the reached amount and an empty track — the bar
 * never invents a target to fill.
 */

const GOAL_UNITS: Record<GoalProgress['key'], string> = {
  duration: 'h',
  distance: 'km',
  elevation: 'm',
}

export interface WeekGoalsProps {
  rows: readonly GoalProgress[]
  className?: string
}

export function WeekGoals({ rows, className }: WeekGoalsProps): ReactElement {
  return (
    <Card aria-labelledby="wochenfortschritt-titel" className={cn(className)}>
      <CardHeader id="wochenfortschritt-titel" title="Wochenfortschritt" hint="Wochenziel" />
      <CardBody className="flex flex-col gap-5">
        {rows.map((row) => {
          const unit = GOAL_UNITS[row.key]
          return (
            <ProgressBar
              key={row.key}
              label={row.label}
              value={row.current}
              max={row.goal}
              readout={
                row.goal === null
                  ? `${row.valueLabel} ${unit}`
                  : `${row.valueLabel} / ${row.goalLabel} ${unit}`
              }
            />
          )
        })}
      </CardBody>
    </Card>
  )
}
