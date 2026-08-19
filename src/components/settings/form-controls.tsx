'use client'

import type { ReactElement } from 'react'

import { cn } from '@/lib/cn'

/**
 * The three controls both settings forms are built from: a labelled number
 * field, a submit button that states its own progress, and one live region for
 * the outcome. Validation messages arrive from the server action — nothing here
 * decides what is valid, it only shows what came back.
 */

const FOCUS_RING = 'focus:outline-2 focus:outline-offset-2 focus:outline-series-1'

export interface NumberFieldProps {
  id: string
  /** German field label, e.g. "Trainingszeit". */
  label: string
  /** Unit shown behind the input, e.g. "h", "km", "bpm". */
  unit: string
  value: string
  onChange: (value: string) => void
  /** German help text under the field, e.g. the accepted range. */
  hint?: string | undefined
  /** German validation message from the server action. */
  error?: string | undefined
  disabled?: boolean
}

export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  hint,
  error,
  disabled = false,
}: NumberFieldProps): ReactElement {
  const hintId = `${id}-hinweis`
  const errorId = `${id}-fehler`
  const describedBy = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((entry): entry is string => entry !== null)
    .join(' ')

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>

      <div className="flex items-center gap-2">
        {/* type="text" with a decimal keypad: "12,5" is what a de-AT user types. */}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-invalid={error !== undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          className={cn(
            'tabular w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-ink',
            'disabled:cursor-not-allowed disabled:opacity-60',
            FOCUS_RING,
            error === undefined ? 'border-border-hair' : 'border-critical',
          )}
        />
        <span className="shrink-0 text-sm text-ink-secondary">{unit}</span>
      </div>

      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-xs font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  )
}

export interface SaveButtonProps {
  pending: boolean
  /** German label of the idle state. */
  label?: string
}

export function SaveButton({ pending, label = 'Speichern' }: SaveButtonProps): ReactElement {
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'rounded-lg border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink',
        'transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series-1',
      )}
    >
      {pending ? 'Wird gespeichert …' : label}
    </button>
  )
}

/** Idle carries no message; the live region stays mounted so it can announce. */
export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string }

export function FormStatus({ state }: { state: SaveState }): ReactElement {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        'min-h-5 text-sm font-medium',
        state.kind === 'saved' ? 'text-good' : state.kind === 'error' ? 'text-critical' : 'text-ink-muted',
      )}
    >
      {/* The wording carries the outcome; the glyph and the colour only repeat it. */}
      {state.kind === 'idle' ? null : (
        <>
          <span aria-hidden="true">{state.kind === 'saved' ? '✓ ' : '! '}</span>
          {state.message}
        </>
      )}
    </p>
  )
}
