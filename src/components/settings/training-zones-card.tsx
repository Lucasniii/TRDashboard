'use client'

import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import {
  FormStatus,
  NumberField,
  SaveButton,
  type SaveState,
} from '@/components/settings/form-controls'
import { parseInputValue, toInputValue } from '@/components/settings/form-values'
import { ZoneTable } from '@/components/settings/zone-table'
import {
  FTP_MAX,
  FTP_MIN,
  HEART_RATE_PERCENT_LABELS,
  MAX_HEART_RATE_MAX,
  MAX_HEART_RATE_MIN,
  POWER_PERCENT_LABELS,
  buildHeartRateZones,
  buildPowerZones,
} from '@/components/settings/zone-math'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { saveSettingsAction, type SettingsFieldKey } from '@/app/einstellungen/actions'
import type { TrainingZoneSet } from '@/lib/domain/types'
import { formatHeartRate, formatNumber, formatPower } from '@/lib/format'

/**
 * "Trainingszonen": the two numbers the athlete actually knows — maximum heart
 * rate and FTP — and the five zones each of them implies.
 *
 * The percentage splits are the ones zone-math.ts computes with:
 *   Herzfrequenz, in percent of the maximum heart rate
 *     Z1 50–60 %  Z2 60–70 %  Z3 70–80 %  Z4 80–90 %  Z5 ab 90 %
 *   Leistung, in percent of FTP (classic Coggan splits)
 *     Z1 bis 55 %  Z2 56–75 %  Z3 76–90 %  Z4 91–105 %  Z5 ab 106 %
 *
 * While a field holds a plausible new basis, the tables show the boundaries it
 * would produce and say so — the same pure functions the server action runs, so
 * the preview and the saved result can never disagree.
 */

const HEADING_ID = 'trainingszonen-titel'

interface ZoneFormValues {
  maxHeartRate: string
  ftpWatts: string
}

type ZoneFieldKey = keyof ZoneFormValues

/** null while the field is empty or outside the plausible range — no preview then. */
function previewZones(
  raw: string,
  min: number,
  max: number,
  build: (basis: number) => TrainingZoneSet,
): TrainingZoneSet | null {
  const parsed = parseInputValue(raw)
  if (parsed === null) return null
  const rounded = Math.round(parsed)
  if (rounded < min || rounded > max) return null
  return build(rounded)
}

export interface TrainingZonesCardProps {
  heartRateZones: TrainingZoneSet
  powerZones: TrainingZoneSet
}

export function TrainingZonesCard({
  heartRateZones,
  powerZones,
}: TrainingZonesCardProps): ReactElement {
  const [values, setValues] = useState<ZoneFormValues>(() => ({
    maxHeartRate: toInputValue(heartRateZones.maxHeartRate ?? null),
    ftpWatts: toInputValue(powerZones.ftpWatts ?? null),
  }))
  const [errors, setErrors] = useState<Partial<Record<SettingsFieldKey, string>>>({})
  const [status, setStatus] = useState<SaveState>({ kind: 'idle' })
  const [pending, startTransition] = useTransition()

  function update(key: ZoneFieldKey, next: string): void {
    setValues((current) => ({ ...current, [key]: next }))
    setErrors((current) => {
      if (current[key] === undefined) return current
      const rest = { ...current }
      delete rest[key]
      return rest
    })
    setStatus({ kind: 'idle' })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveSettingsAction({ zones: values })
      if (result.ok) {
        setErrors({})
        setStatus({ kind: 'saved', message: result.message })
        return
      }
      setErrors(result.errors)
      setStatus({ kind: 'error', message: result.message })
    })
  }

  const heartRatePreview = previewZones(
    values.maxHeartRate,
    MAX_HEART_RATE_MIN,
    MAX_HEART_RATE_MAX,
    buildHeartRateZones,
  )
  const powerPreview = previewZones(values.ftpWatts, FTP_MIN, FTP_MAX, buildPowerZones)

  const shownHeartRate = heartRatePreview ?? heartRateZones
  const shownPower = powerPreview ?? powerZones

  const heartRateUnsaved =
    heartRatePreview !== null && heartRatePreview.maxHeartRate !== heartRateZones.maxHeartRate
  const powerUnsaved = powerPreview !== null && powerPreview.ftpWatts !== powerZones.ftpWatts

  return (
    <Card aria-labelledby={HEADING_ID}>
      <CardHeader
        id={HEADING_ID}
        as="h2"
        title="Trainingszonen"
        hint="Herzfrequenzzonen aus dem Maximalpuls, Leistungszonen aus der FTP."
      />

      <CardBody className="flex flex-col gap-6">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              id="basis-maximalpuls"
              label="Maximalpuls"
              unit="bpm"
              value={values.maxHeartRate}
              onChange={(next) => {
                update('maxHeartRate', next)
              }}
              hint={`Zwischen ${formatNumber(MAX_HEART_RATE_MIN)} und ${formatNumber(MAX_HEART_RATE_MAX)} bpm`}
              error={errors.maxHeartRate}
              disabled={pending}
            />
            <NumberField
              id="basis-ftp"
              label="FTP"
              unit="W"
              value={values.ftpWatts}
              onChange={(next) => {
                update('ftpWatts', next)
              }}
              hint={`Zwischen ${formatNumber(FTP_MIN)} und ${formatNumber(FTP_MAX)} W`}
              error={errors.ftpWatts}
              disabled={pending}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SaveButton pending={pending} label="Zonen speichern" />
            <FormStatus state={status} />
          </div>
        </form>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section aria-labelledby="zonen-herzfrequenz" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 id="zonen-herzfrequenz" className="text-sm font-semibold text-ink">
                Herzfrequenzzonen
              </h3>
              {heartRateUnsaved ? (
                <Badge tone="warning">Vorschau · noch nicht gespeichert</Badge>
              ) : null}
            </div>
            <p className="text-xs text-ink-muted">
              Maximalpuls:{' '}
              <span className="tabular">
                {formatHeartRate(shownHeartRate.maxHeartRate ?? null)}
              </span>
            </p>
            <ZoneTable
              zones={shownHeartRate}
              unit="bpm"
              percentLabels={HEART_RATE_PERCENT_LABELS}
              percentHeader="% vom Max."
              caption="Herzfrequenzzonen: Zone, Name, Anteil am Maximalpuls und Bereich in Schlägen pro Minute."
            />
          </section>

          <section aria-labelledby="zonen-leistung" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h3 id="zonen-leistung" className="text-sm font-semibold text-ink">
                Leistungszonen
              </h3>
              {powerUnsaved ? <Badge tone="warning">Vorschau · noch nicht gespeichert</Badge> : null}
            </div>
            <p className="text-xs text-ink-muted">
              FTP: <span className="tabular">{formatPower(shownPower.ftpWatts ?? null)}</span>
            </p>
            <ZoneTable
              zones={shownPower}
              unit="W"
              percentLabels={POWER_PERCENT_LABELS}
              percentHeader="% der FTP"
              caption="Leistungszonen: Zone, Name, Anteil an der FTP und Bereich in Watt."
            />
          </section>
        </div>

        <p className="text-xs text-ink-muted">
          Die Grenzen folgen festen Prozentanteilen: 50 / 60 / 70 / 80 / 90 % des Maximalpulses
          und 55 / 75 / 90 / 105 % der FTP. Die oberste Zone ist jeweils nach oben offen.
        </p>
      </CardBody>
    </Card>
  )
}
