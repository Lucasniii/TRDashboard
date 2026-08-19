import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'

import { ActivityMetricGrid } from '@/components/activities/activity-metric-grid'
import { ActivityStreamCharts } from '@/components/activities/activity-stream-charts'
import { ACTIVITY_TYPE_LABELS } from '@/components/activities/activity-type'
import { detailMetrics } from '@/components/activities/metrics'
import { RouteMap, canRenderRoute } from '@/components/activities/route-map'
import { buildStreamSeries } from '@/components/activities/streams'
import { ZoneDistribution } from '@/components/charts/zone-bar'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/section'
import { aggregateZones } from '@/lib/analytics/zones'
import { getRepository } from '@/lib/data'
import { formatDateLong, formatDuration, formatNumber, formatTime } from '@/lib/format'

/**
 * One activity in full: the numbers the source reported, the recorded traces on
 * a shared time axis, the zone split, and the track. Every panel that has no
 * data is left out or says so — nothing here is filled in to look complete.
 */

interface ActivityDetailPageProps {
  /** Route params arrive as a Promise in Next 16. */
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ActivityDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const detail = await getRepository().getActivityById(id)
  return {
    title: detail === null ? 'Aktivität nicht gefunden · TRDashboard' : `${detail.activity.name} · TRDashboard`,
  }
}

export default async function ActivityDetailPage({
  params,
}: ActivityDetailPageProps): Promise<ReactElement> {
  const { id } = await params
  const repository = getRepository()

  const [detail, settings, sources] = await Promise.all([
    repository.getActivityById(id),
    repository.getSettings(),
    repository.getDataSources(),
  ])

  if (detail === null) notFound()

  const { activity, streams } = detail

  const sourceLabel = sources.find((entry) => entry.provider === activity.source.provider)?.label
  const streamSeries = buildStreamSeries(streams)

  const heartRateZones = aggregateZones([activity], 'heart_rate', settings.heartRateZones)
  // No power zones on the activity means the source never measured watts here —
  // an empty power panel would only imply the data went missing.
  const powerZones =
    activity.powerZoneSec === null
      ? null
      : aggregateZones([activity], 'power', settings.powerZones)

  const latLng = streams?.latLng ?? null
  const showRoute = canRenderRoute(latLng)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/aktivitaeten"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1"
        >
          <span aria-hidden="true">←</span>
          Alle Aktivitäten
        </Link>

        <PageHeader
          title={activity.name}
          subline={`${formatDateLong(activity.startedAt)} · ${formatTime(activity.startedAt)} Uhr`}
          action={<Badge>{ACTIVITY_TYPE_LABELS[activity.type]}</Badge>}
        />
      </div>

      <Card aria-labelledby="kennzahlen">
        <CardHeader
          id="kennzahlen"
          title="Kennzahlen"
          {...(sourceLabel === undefined ? {} : { hint: `Quelle: ${sourceLabel}` })}
        />
        <CardBody>
          <ActivityMetricGrid metrics={detailMetrics(activity)} />
        </CardBody>
      </Card>

      <Card aria-labelledby="verlauf">
        <CardHeader
          id="verlauf"
          title="Verlauf"
          hint={
            streamSeries.intervalSec === null
              ? 'Aufgezeichnete Messreihen der Aktivität'
              : `Aufgezeichnete Messwerte, ein Punkt alle ${formatNumber(streamSeries.intervalSec)} s`
          }
        />
        <CardBody>
          {streamSeries.keys.length === 0 ? (
            <EmptyState
              title="Keine Messreihen aufgezeichnet"
              description="Für diese Aktivität hat die Quelle keine Zeitreihen geliefert."
              hint="Die Kennzahlen oben stammen direkt aus der Zusammenfassung der Aktivität."
            />
          ) : (
            <ActivityStreamCharts points={streamSeries.points} keys={streamSeries.keys} />
          )}
        </CardBody>
      </Card>

      <div className={powerZones === null ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
        <Card aria-labelledby="hf-zonen">
          <CardHeader
            id="hf-zonen"
            title="Zeit in Herzfrequenzzonen"
            hint={
              heartRateZones.hasData
                ? `Gesamt ${formatDuration(heartRateZones.totalSec)}`
                : undefined
            }
          />
          <CardBody>
            <ZoneDistribution
              slices={heartRateZones.slices}
              totalSec={heartRateZones.totalSec}
              hasData={heartRateZones.hasData}
              label="Zeit in Herzfrequenzzonen"
              emptyDescription="Für diese Aktivität liegen keine Herzfrequenzzonen vor"
            />
          </CardBody>
        </Card>

        {powerZones === null ? null : (
          <Card aria-labelledby="leistungs-zonen">
            <CardHeader
              id="leistungs-zonen"
              title="Zeit in Leistungszonen"
              hint={
                powerZones.hasData ? `Gesamt ${formatDuration(powerZones.totalSec)}` : undefined
              }
            />
            <CardBody>
              <ZoneDistribution
                slices={powerZones.slices}
                totalSec={powerZones.totalSec}
                hasData={powerZones.hasData}
                label="Zeit in Leistungszonen"
                emptyDescription="Für diese Aktivität liegen keine Leistungszonen vor"
              />
            </CardBody>
          </Card>
        )}
      </div>

      {!showRoute || latLng === null ? null : (
        <Card aria-labelledby="strecke">
          <CardHeader
            id="strecke"
            title="Strecke"
            hint="Aufgezeichneter Streckenverlauf, ohne Kartenhintergrund"
          />
          <CardBody>
            <RouteMap latLng={latLng} label={`Streckenverlauf: ${activity.name}`} />
          </CardBody>
        </Card>
      )}
    </div>
  )
}
