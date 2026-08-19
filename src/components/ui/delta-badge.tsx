import { formatDelta, NO_DATA } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * Period-over-period change. Colour never carries the meaning alone — the
 * arrow glyph states the direction, and screen readers get it as a word.
 */

const DEFAULT_LABEL = 'Im Vergleich zur Vorwoche'

type Direction = 'up' | 'down' | 'flat' | 'none'

export interface DeltaBadgeProps {
  /** Relative change in percent. null renders "keine Daten". */
  value: number | null | undefined
  /** German comparison basis, shown as tooltip and read out. */
  label?: string
  /** Lower is better (Ruhepuls, Erholungspuls): flips which direction is good. */
  invert?: boolean
  digits?: number
  /** Renders the comparison basis as visible text next to the value. */
  showLabel?: boolean
  className?: string
}

export function DeltaBadge({
  value,
  label = DEFAULT_LABEL,
  invert = false,
  digits = 0,
  showLabel = false,
  className,
}: DeltaBadgeProps) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(value)
  // Round before deciding the direction, so a "+0 %" readout never gets an up arrow.
  const rounded = hasValue ? Number(value.toFixed(digits)) : null

  const direction: Direction =
    rounded === null ? 'none' : rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'

  const glyph = direction === 'up' ? '↑' : direction === 'down' ? '↓' : direction === 'flat' ? '→' : ''

  const isGood = invert ? direction === 'down' : direction === 'up'
  const isBad = invert ? direction === 'up' : direction === 'down'
  const tone = isGood ? 'text-delta-up' : isBad ? 'text-delta-down' : 'text-ink-muted'

  const text = formatDelta(rounded, digits)
  const spokenDirection =
    direction === 'up'
      ? 'höher'
      : direction === 'down'
        ? 'niedriger'
        : direction === 'flat'
          ? 'unverändert'
          : ''
  // Every visible part is aria-hidden, so this string alone has to carry the
  // basis, the number and the direction.
  const spoken =
    direction === 'none' ? `${label}: ${NO_DATA}` : `${label}: ${text} ${spokenDirection}`

  return (
    <span
      className={cn('inline-flex items-baseline gap-1 text-sm font-medium', tone, className)}
      title={label}
    >
      <span aria-hidden="true">{glyph}</span>
      <span aria-hidden="true" className="tabular">
        {text}
      </span>
      {showLabel ? (
        <span aria-hidden="true" className="text-xs text-ink-muted">
          {label}
        </span>
      ) : null}
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
