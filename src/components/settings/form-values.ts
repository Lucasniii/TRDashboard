import { LOCALE } from '@/lib/format'

/**
 * The two directions the settings forms need between a stored number and the
 * text inside an <input>. Parsing here only feeds the live zone preview — the
 * server action in src/app/einstellungen/actions.ts validates again and owns
 * every message the user gets to see.
 */

const FORMATTERS = new Map<number, Intl.NumberFormat>()

function formatter(digits: number): Intl.NumberFormat {
  const cached = FORMATTERS.get(digits)
  if (cached !== undefined) return cached
  const created = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: digits,
    useGrouping: false,
  })
  FORMATTERS.set(digits, created)
  return created
}

/**
 * null becomes an empty field, which the action reads back as "kein Wochenziel"
 * — a goal nobody set is never displayed as a 0.
 */
export function toInputValue(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return formatter(digits).format(value)
}

/** Accepts the de-AT decimal comma as well as the dot, exactly like the server. */
export function parseInputValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(value) ? value : null
}
