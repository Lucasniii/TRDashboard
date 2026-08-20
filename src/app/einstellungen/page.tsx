import type { Metadata } from 'next'
import type { ReactElement } from 'react'

import { AppearanceCard } from '@/components/settings/appearance-card'
import { ConnectionBanner } from '@/components/settings/connection-banner'
import { DataSourcesCard } from '@/components/settings/data-sources-card'
import { TrainingZonesCard } from '@/components/settings/training-zones-card'
import { WeeklyGoalsCard } from '@/components/settings/weekly-goals-card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/section'
import { requireDashboardUserId } from '@/lib/auth/require-dashboard-user'
import { IS_MOCK_DATA, getRepository } from '@/lib/data'

/**
 * Einstellungen — the only page that writes. One server read hands the stored
 * settings and the data sources over; the two forms send their section back
 * through the server action in ./actions.ts, which validates and persists it.
 */

export const metadata: Metadata = {
  title: 'Einstellungen · TRDashboard',
  description: 'Wochenziele, Trainingszonen, Datenquellen und Darstellung',
}

/** The OAuth routes redirect back here with their outcome in the query. */
interface SettingsSearchParams {
  verbunden?: string
  fehler?: string
  quelle?: string
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>
}): Promise<ReactElement> {
  const repository = getRepository(await requireDashboardUserId())

  const [settings, dataSources, params] = await Promise.all([
    repository.getSettings(),
    repository.getDataSources(),
    searchParams,
  ])

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Einstellungen"
        subline="Wochenziele, Trainingszonen, Datenquellen und Darstellung"
        action={
          IS_MOCK_DATA ? (
            <Badge tone="warning">Demodaten</Badge>
          ) : (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
              >
                Abmelden
              </button>
            </form>
          )
        }
      />

      <ConnectionBanner
        {...(params.verbunden === undefined ? {} : { connected: params.verbunden })}
        {...(params.fehler === undefined ? {} : { error: params.fehler })}
        {...(params.quelle === undefined ? {} : { source: params.quelle })}
      />

      <WeeklyGoalsCard goals={settings.weeklyGoals} />

      <TrainingZonesCard
        heartRateZones={settings.heartRateZones}
        powerZones={settings.powerZones}
      />

      <DataSourcesCard sources={dataSources} />

      <AppearanceCard />
    </div>
  )
}
