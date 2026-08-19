import type { ReactElement } from 'react'

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import type { DailyHealthMetrics, RecoveryMetric, SleepSession } from '@/lib/domain/types'
import {
  NO_DATA,
  formatDuration,
  formatHeartRate,
  formatHoursMinutes,
  formatHrv,
  formatPercent,
  formatRespiratoryRate,
  formatTemperature,
  formatWeight,
} from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The measured day. Every row reads its value straight out of the stored
 * record; a metric the provider never delivered shows "keine Daten" instead of
 * a zero, and a missing record leaves every row in that state.
 */

function HealthRow({ label, value }: { label: string; value: string }): ReactElement {
  const missing = value === NO_DATA
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="min-w-0 text-sm text-ink-secondary">{label}</dt>
      <dd className={cn('shrink-0 text-sm tabular', missing ? 'text-ink-muted' : 'text-ink')}>
        {value}
      </dd>
    </div>
  )
}

interface StageRow {
  label: string
  seconds: number
}

function stageRows(session: SleepSession | null): StageRow[] | null {
  const stages = session?.stages ?? null
  if (stages === null) return null
  return [
    { label: 'Tiefschlaf', seconds: stages.deepSec },
    { label: 'REM', seconds: stages.remSec },
    { label: 'Leichtschlaf', seconds: stages.lightSec },
    { label: 'Wach', seconds: stages.awakeSec },
  ]
}

export interface DayHealthCardProps {
  health: DailyHealthMetrics | null
  sleep: SleepSession | null
  recovery: RecoveryMetric | null
}

export function DayHealthCard({ health, sleep, recovery }: DayHealthCardProps): ReactElement {
  const stages = stageRows(sleep)
  const stageTotal = stages === null ? 0 : stages.reduce((sum, row) => sum + row.seconds, 0)

  return (
    <Card aria-labelledby="tag-gesundheit">
      <CardHeader
        id="tag-gesundheit"
        title="Gesundheit"
        hint={sleep === null ? undefined : `Schlaf ${formatHoursMinutes(sleep.durationSec)}`}
      />
      <CardBody>
        <dl className="divide-y divide-border-hair">
          <HealthRow label="HRV" value={formatHrv(health?.hrvMs ?? null)} />
          <HealthRow label="Ruhepuls" value={formatHeartRate(health?.restingHeartRate ?? null)} />
          <HealthRow label="Schlafdauer" value={formatHoursMinutes(sleep?.durationSec ?? null)} />
          <HealthRow label="Schlafqualität" value={formatPercent(sleep?.sleepScore ?? null)} />

          <div className="py-2.5">
            <dt className="text-sm text-ink-secondary">Schlafphasen</dt>
            <dd className="mt-2">
              {stages === null || stageTotal <= 0 ? (
                <span className="text-sm text-ink-muted">{NO_DATA}</span>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {stages.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-baseline justify-between gap-4 text-sm"
                    >
                      <span className="min-w-0 text-ink-secondary">{row.label}</span>
                      <span className="shrink-0 tabular text-ink">
                        {formatDuration(row.seconds)}
                        <span className="ml-2 text-ink-muted">
                          {formatPercent((row.seconds / stageTotal) * 100)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>

          <HealthRow label="Erholung" value={formatPercent(recovery?.providerScore ?? null)} />
          <HealthRow
            label="Atemfrequenz"
            value={formatRespiratoryRate(health?.respiratoryRate ?? null)}
          />
          <HealthRow
            label="Sauerstoffsättigung (SpO₂)"
            value={formatPercent(health?.bloodOxygenPct ?? null, 1)}
          />
          <HealthRow
            label="Hauttemperatur"
            value={formatTemperature(health?.skinTemperatureC ?? null)}
          />
          <HealthRow label="Gewicht" value={formatWeight(health?.weightKg ?? null)} />
        </dl>
      </CardBody>
    </Card>
  )
}
