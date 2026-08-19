import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

/**
 * The correlation readout. It says one plain German sentence and then says out
 * loud that a correlation is not a cause — the reason this card exists at all
 * is that a coefficient without that sentence invites the wrong conclusion.
 */

/** Mirrors MIN_CORRELATION_PAIRS in @/lib/analytics/trends: below this, correlate() returns null. */
const MIN_COMMON_DAYS = 8

export interface CorrelationPair {
  /** German name of the first metric. */
  labelA: string
  labelB: string
  /** Pearson r, or null when correlate() refused to compute one. */
  r: number | null
  /** Days where both series carry a measurement. */
  commonDays: number
}

export interface CorrelationCardProps {
  /** Set only while exactly two metrics are selected. */
  pair: CorrelationPair | null
  selectedCount: number
}

/** |r| buckets, in the wording the sentence uses. */
export function correlationStrength(r: number): string {
  const strength = Math.abs(r)
  if (strength < 0.2) return 'kein erkennbarer'
  if (strength < 0.4) return 'schwacher'
  if (strength < 0.6) return 'mittlerer'
  if (strength < 0.8) return 'starker'
  return 'sehr starker'
}

/** "−0,42" — the typographic minus, never the hyphen. */
export function formatCorrelation(r: number): string {
  const sign = r < 0 ? '−' : ''
  return `${sign}${formatNumber(Math.abs(r), 2)}`
}

export function correlationSentence(pair: CorrelationPair & { r: number }): string {
  const { labelA, labelB, r, commonDays } = pair
  // "kein erkennbarer negativer Zusammenhang" would be a contradiction, so the
  // direction is only named once there is one worth naming.
  const description =
    Math.abs(r) < 0.2
      ? 'kein erkennbarer Zusammenhang'
      : `${correlationStrength(r)} ${r < 0 ? 'negativer' : 'positiver'} Zusammenhang`
  return `Zusammenhang zwischen ${labelA} und ${labelB}: r = ${formatCorrelation(r)} (${description}, ${commonDays} gemeinsame Tage)`
}

function selectionSentence(selectedCount: number): string {
  if (selectedCount === 0) return 'Aktuell ist keine Messgröße ausgewählt.'
  if (selectedCount === 1) return 'Aktuell ist eine Messgröße ausgewählt.'
  return `Aktuell sind ${selectedCount} Messgrößen ausgewählt.`
}

const CAVEAT = 'Ein Zusammenhang ist keine Ursache.'

export function CorrelationCard({ pair, selectedCount }: CorrelationCardProps) {
  return (
    <Card aria-labelledby="zusammenhang-titel">
      <CardHeader
        id="zusammenhang-titel"
        as="h2"
        title="Zusammenhang"
        hint="Pearson-Korrelation über die Tage, an denen beide Messgrößen einen Wert haben."
      />
      <CardBody className="flex flex-col gap-3">
        {pair === null ? (
          <>
            <p className="text-base text-ink">
              Der Korrelationskoeffizient wird für genau zwei Messgrößen berechnet.
            </p>
            <p className="text-sm text-ink-secondary">{selectionSentence(selectedCount)}</p>
          </>
        ) : pair.r === null ? (
          <>
            <p className="text-base text-ink">
              Zusammenhang zwischen {pair.labelA} und {pair.labelB}: zu wenige gemeinsame Tage.
            </p>
            <p className="text-sm text-ink-secondary">
              Gemeinsame Tage mit Werten in beiden Reihen: {pair.commonDays}. Ab{' '}
              {MIN_COMMON_DAYS} gemeinsamen Tagen wird r berechnet, darunter wäre die Zahl
              Rauschen.
            </p>
          </>
        ) : (
          <>
            <p className="text-base leading-relaxed text-ink sm:text-lg">
              {correlationSentence({ ...pair, r: pair.r })}
            </p>
            <p className="text-sm text-ink-muted">{CAVEAT}</p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
