'use client'

import { useState, useTransition, type FormEvent, type ReactElement } from 'react'

import {
  FormStatus,
  NumberField,
  SaveButton,
  type SaveState,
} from '@/components/settings/form-controls'
import { toInputValue } from '@/components/settings/form-values'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { saveSettingsAction, type SettingsFieldKey } from '@/app/einstellungen/actions'
import type { WeeklyGoals } from '@/lib/domain/types'

/**
 * "Wochenziele": the three targets the Wochenfortschritt panel on the Übersicht
 * measures the running week against. The form keeps the raw strings — hours,
 * kilometres, metres — and the server action converts, validates and persists
 * them; a field left empty means "kein Ziel" and is stored as null, never as 0.
 */

const HEADING_ID = 'wochenziele-titel'

interface GoalFormValues {
  duration: string
  distance: string
  elevation: string
}

type GoalFieldKey = keyof GoalFormValues

function initialValues(goals: WeeklyGoals): GoalFormValues {
  return {
    duration: toInputValue(goals.durationSec === null ? null : goals.durationSec / 3600, 1),
    distance: toInputValue(goals.distanceM === null ? null : goals.distanceM / 1000, 1),
    elevation: toInputValue(goals.elevationGainM, 0),
  }
}

export interface WeeklyGoalsCardProps {
  goals: WeeklyGoals
}

export function WeeklyGoalsCard({ goals }: WeeklyGoalsCardProps): ReactElement {
  const [values, setValues] = useState<GoalFormValues>(() => initialValues(goals))
  const [errors, setErrors] = useState<Partial<Record<SettingsFieldKey, string>>>({})
  const [status, setStatus] = useState<SaveState>({ kind: 'idle' })
  const [pending, startTransition] = useTransition()

  function update(key: GoalFieldKey, next: string): void {
    setValues((current) => ({ ...current, [key]: next }))
    // An edited field is no longer the field the last answer talked about.
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
      const result = await saveSettingsAction({ goals: values })
      if (result.ok) {
        setErrors({})
        setStatus({ kind: 'saved', message: result.message })
        return
      }
      setErrors(result.errors)
      setStatus({ kind: 'error', message: result.message })
    })
  }

  return (
    <Card aria-labelledby={HEADING_ID}>
      <CardHeader
        id={HEADING_ID}
        as="h2"
        title="Wochenziele"
        hint="Ziele je Kalenderwoche. Sie sind die Basis für den Wochenfortschritt auf der Übersicht."
      />

      <CardBody>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              id="ziel-trainingszeit"
              label="Trainingszeit"
              unit="h"
              value={values.duration}
              onChange={(next) => {
                update('duration', next)
              }}
              hint="Stunden pro Woche"
              error={errors.duration}
              disabled={pending}
            />
            <NumberField
              id="ziel-kilometer"
              label="Kilometer"
              unit="km"
              value={values.distance}
              onChange={(next) => {
                update('distance', next)
              }}
              hint="Kilometer pro Woche"
              error={errors.distance}
              disabled={pending}
            />
            <NumberField
              id="ziel-hoehenmeter"
              label="Höhenmeter"
              unit="m"
              value={values.elevation}
              onChange={(next) => {
                update('elevation', next)
              }}
              hint="Höhenmeter pro Woche"
              error={errors.elevation}
              disabled={pending}
            />
          </div>

          <p className="text-xs text-ink-muted">
            Ein leeres Feld bedeutet „kein Ziel“: Der Wochenfortschritt zeigt dann den erreichten
            Wert ohne Zielbalken an.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SaveButton pending={pending} label="Wochenziele speichern" />
            <FormStatus state={status} />
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
