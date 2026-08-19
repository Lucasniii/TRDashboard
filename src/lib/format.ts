/**
 * All user-facing formatting. Locale is de-AT and units are metric everywhere.
 * Missing data is a first-class case: every formatter accepts null and returns
 * the placeholder rather than inventing a zero.
 */

export const LOCALE = 'de-AT'
export const NO_DATA = 'keine Daten'

function nf(min: number, max: number): Intl.NumberFormat {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return nf(digits, digits).format(value)
}

/** Metres in, kilometres out: 287340 → "287 km". */
export function formatDistance(metres: number | null | undefined, digits?: number): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return NO_DATA
  const km = metres / 1000
  const precision = digits ?? (km >= 100 ? 0 : 1)
  return `${nf(precision, precision).format(km)} km`
}

/** Bare kilometre value without the unit, for axis ticks. */
export function formatKm(metres: number | null | undefined, digits = 0): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return NO_DATA
  return nf(digits, digits).format(metres / 1000)
}

/** 42120 → "11 h 42 min". Under an hour → "48 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NO_DATA
  const total = Math.round(seconds / 60)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

/** 42120 → "11:42". For goal readouts like "11:42 / 15:00 h". */
export function formatDurationClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return NO_DATA
  const total = Math.round(seconds / 60)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/** Sleep and other sub-day spans read better as "7 h 12 min". */
export function formatHoursMinutes(seconds: number | null | undefined): string {
  return formatDuration(seconds)
}

export function formatElevation(metres: number | null | undefined): string {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return NO_DATA
  return `${nf(0, 0).format(Math.round(metres))} m`
}

export function formatSpeed(metresPerSecond: number | null | undefined): string {
  if (
    metresPerSecond === null ||
    metresPerSecond === undefined ||
    !Number.isFinite(metresPerSecond)
  ) {
    return NO_DATA
  }
  return `${nf(1, 1).format(metresPerSecond * 3.6)} km/h`
}

export function formatHeartRate(bpm: number | null | undefined): string {
  if (bpm === null || bpm === undefined || !Number.isFinite(bpm)) return NO_DATA
  return `${nf(0, 0).format(Math.round(bpm))} bpm`
}

export function formatPower(watts: number | null | undefined): string {
  if (watts === null || watts === undefined || !Number.isFinite(watts)) return NO_DATA
  return `${nf(0, 0).format(Math.round(watts))} W`
}

export function formatHrv(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) {
    return NO_DATA
  }
  return `${nf(0, 0).format(Math.round(milliseconds))} ms`
}

export function formatCalories(kcal: number | null | undefined): string {
  if (kcal === null || kcal === undefined || !Number.isFinite(kcal)) return NO_DATA
  return `${nf(0, 0).format(Math.round(kcal))} kcal`
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_DATA
  return `${nf(digits, digits).format(value)} %`
}

/** Signed change for period comparisons: 12.4 → "+12 %", -3 → "−3 %". */
export function formatDelta(percent: number | null | undefined, digits = 0): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return NO_DATA
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : ''
  return `${sign}${nf(digits, digits).format(Math.abs(percent))} %`
}

export function formatTemperature(celsius: number | null | undefined): string {
  if (celsius === null || celsius === undefined || !Number.isFinite(celsius)) return NO_DATA
  return `${nf(1, 1).format(celsius)} °C`
}

export function formatRespiratoryRate(perMinute: number | null | undefined): string {
  if (perMinute === null || perMinute === undefined || !Number.isFinite(perMinute)) return NO_DATA
  return `${nf(1, 1).format(perMinute)} /min`
}

export function formatWeight(kilograms: number | null | undefined): string {
  if (kilograms === null || kilograms === undefined || !Number.isFinite(kilograms)) return NO_DATA
  return `${nf(1, 1).format(kilograms)} kg`
}

// ── dates ────────────────────────────────────────────────────────────────────

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** "14. Aug." */
export function formatDayMonth(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(asDate(value))
}

/** "14. August 2026" */
export function formatDateLong(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(asDate(value))
}

/** "Mo" */
export function formatWeekdayShort(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(asDate(value))
}

/** "Montag" */
export function formatWeekdayLong(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(asDate(value))
}

/** "17:45" */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(
    asDate(value),
  )
}

/** "Mo, 14. Aug., 17:45" */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(asDate(value))
}

/** "11. – 17. August 2026" */
export function formatDateRangeLabel(from: string | Date, to: string | Date): string {
  const a = asDate(from)
  const b = asDate(to)
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const dayOnly = new Intl.DateTimeFormat(LOCALE, { day: 'numeric' })
  const full = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
  const withMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' })
  if (sameMonth) return `${dayOnly.format(a)}. – ${full.format(b)}`
  return `${withMonth.format(a)} – ${full.format(b)}`
}
