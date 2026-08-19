import type { ReactElement } from 'react'

import { Badge, type BadgeTone } from '@/components/ui/badge'
import { DataSourceActions } from '@/components/settings/data-source-actions'
import { SyncPanel } from '@/components/settings/sync-panel'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { DataSourceStatus, ProviderCapabilities, ProviderId } from '@/lib/domain/types'
import { NO_DATA, formatDateTime } from '@/lib/format'

/**
 * "Datenquellen": which platform delivers what. The capability chips are the
 * point of this card — a source that has no power data should say so here,
 * before a panel elsewhere shows "keine Daten" and leaves the reason open.
 *
 * WHOOP and Wahoo have adapters and can be connected; the rest are listed so
 * the planned coverage is visible, with their buttons disabled.
 */

const HEADING_ID = 'datenquellen-titel'

/** Platforms with a working adapter. Everything else cannot be connected yet. */
const CONNECTABLE: Partial<Record<ProviderId, readonly [string, string]>> = {
  whoop: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'],
  wahoo: ['WAHOO_CLIENT_ID', 'WAHOO_CLIENT_SECRET'],
}

const CAPABILITY_LABELS: Record<keyof ProviderCapabilities, string> = {
  activities: 'Aktivitäten',
  activityStreams: 'Messreihen',
  gps: 'GPS',
  hrZones: 'Herzfrequenzzonen',
  powerZones: 'Leistungszonen',
  hrv: 'HRV',
  restingHeartRate: 'Ruhepuls',
  sleep: 'Schlaf',
  recoveryScore: 'Erholung',
  weight: 'Gewicht',
}

/** Reading order of the chips — fixed, so two sources stay comparable. */
const CAPABILITY_ORDER: ReadonlyArray<keyof ProviderCapabilities> = [
  'activities',
  'activityStreams',
  'gps',
  'hrZones',
  'powerZones',
  'hrv',
  'restingHeartRate',
  'sleep',
  'recoveryScore',
  'weight',
]

interface StatusLabel {
  text: string
  tone: BadgeTone
}

function statusLabel(source: DataSourceStatus): StatusLabel {
  if (source.connected) return { text: 'Verbunden', tone: 'good' }
  if (source.configured) return { text: 'Nicht verbunden', tone: 'warning' }
  return { text: 'Nicht konfiguriert', tone: 'neutral' }
}

function capabilityKeys(
  capabilities: ProviderCapabilities,
  delivered: boolean,
): ReadonlyArray<keyof ProviderCapabilities> {
  return CAPABILITY_ORDER.filter((key) => capabilities[key] === delivered)
}

export interface DataSourcesCardProps {
  sources: readonly DataSourceStatus[]
}

export function DataSourcesCard({ sources }: DataSourcesCardProps): ReactElement {
  return (
    <Card aria-labelledby={HEADING_ID}>
      <CardHeader
        id={HEADING_ID}
        as="h2"
        title="Datenquellen"
        hint="Was jede Quelle liefert und wann sie zuletzt synchronisiert hat."
      />

      <CardBody className="flex flex-col gap-4">
        {sources.length === 0 ? (
          <EmptyState
            title="Keine Datenquellen"
            description="Es ist keine Datenquelle hinterlegt."
          />
        ) : (
          <ul className="flex flex-col">
            {sources.map((source) => {
              const status = statusLabel(source)
              const envVars = CONNECTABLE[source.provider]
              const provides = capabilityKeys(source.capabilities, true)
              const missing = capabilityKeys(source.capabilities, false)

              return (
                <li
                  key={source.provider}
                  className="flex flex-col gap-3 border-b border-border-hair py-4 first:pt-0 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{source.label}</span>
                        <Badge tone={status.tone}>{status.text}</Badge>
                      </div>
                      <p className="text-xs text-ink-muted">
                        Letzte Synchronisierung:{' '}
                        <span className="tabular">
                          {source.lastSyncAt === null ? NO_DATA : formatDateTime(source.lastSyncAt)}
                        </span>
                      </p>
                    </div>

                    <DataSourceActions
                      provider={source.provider}
                      label={source.label}
                      connected={source.connected}
                      configured={source.configured}
                      connectable={envVars !== undefined}
                      {...(envVars === undefined ? {} : { envVars })}
                    />
                  </div>

                  {provides.length === 0 ? (
                    <p className="text-xs text-ink-muted">
                      Diese Quelle liefert derzeit keine Messgrößen.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-ink-muted">Liefert:</span>
                      {provides.map((key) => (
                        <Badge key={key} tone="info">
                          {CAPABILITY_LABELS[key]}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {missing.length === 0 ? null : (
                    <p className="text-xs text-ink-muted">
                      Ohne: {missing.map((key) => CAPABILITY_LABELS[key]).join(', ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <SyncPanel />
      </CardBody>
    </Card>
  )
}
