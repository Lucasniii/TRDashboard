/**
 * Deterministic mock dataset for a single Vienna-based cyclist.
 *
 * Everything here is a pure function of the `today` argument and a fixed seed:
 * no Math.random, no Date.now. Two calls with the same `today` produce byte
 * identical output, which keeps server and client renders in agreement.
 *
 * The generator deliberately produces holes. Roughly one day in twenty is
 * missing a given health metric, strength and hiking sessions carry no power
 * data at all, and indoor rides have no GPS. Those gaps are the point: the UI
 * has to render "keine Daten" instead of a fabricated zero.
 */

import { addDays, fromDayKey, startOfWeek, toDayKey } from '@/lib/date'
import type {
  Activity,
  ActivityStreams,
  ActivityType,
  DailyHealthMetrics,
  RecoveryMetric,
  SleepSession,
  SourceRef,
  TrainingZoneSet,
  UserSettings,
  ZoneBoundary,
  ZoneSeconds,
} from '@/lib/domain/types'

export interface MockDataset {
  settings: UserSettings
  activities: Activity[]
  streams: Record<string, ActivityStreams>
  dailyHealth: DailyHealthMetrics[]
  sleep: SleepSession[]
  recovery: RecoveryMetric[]
}

const USER_ID = 'mock-user'
const TIMEZONE = 'Europe/Vienna'
const SEED = 0x5c1f_2a37
const HISTORY_WEEKS = 16
const MAX_HEART_RATE = 188
const FTP_WATTS = 265

/** Roughly Vienna city centre; every generated GPS loop starts from here. */
const HOME_LAT = 48.2082
const HOME_LNG = 16.3738
const HOME_ALTITUDE_M = 190

// ── seeded PRNG ──────────────────────────────────────────────────────────────

type Rng = () => number

/** mulberry32 — small, fast, and good enough for plausible-looking noise. */
function createRng(seed: number): Rng {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Range = readonly [number, number]
type ZoneWeights = readonly [number, number, number, number, number]

function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

function randIn(rng: Rng, range: Range): number {
  return randRange(rng, range[0], range[1])
}

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1))
}

function pick<T>(rng: Rng, items: readonly [T, ...T[]]): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// ── Vienna wall-clock helpers ────────────────────────────────────────────────

/**
 * Timestamps carry the offset the ride was recorded in, so they must not depend
 * on the timezone the process happens to run in. Both helpers below read the
 * offset out of the ICU database instead.
 */
const VIENNA_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function viennaWallClock(instantMs: number): WallClock {
  const parts = VIENNA_PARTS.formatToParts(new Date(instantMs))
  const bag: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') bag[part.type] = Number(part.value)
  }
  return {
    year: bag.year ?? 1970,
    month: bag.month ?? 1,
    day: bag.day ?? 1,
    hour: (bag.hour ?? 0) % 24,
    minute: bag.minute ?? 0,
    second: bag.second ?? 0,
  }
}

function viennaOffsetMinutes(instantMs: number): number {
  const wall = viennaWallClock(instantMs)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000)
}

/** Epoch milliseconds for a wall-clock time on a given day in Vienna. */
function viennaInstant(dayKey: string, hour: number, minute: number): number {
  const [year, month, day] = dayKey.split('-').map(Number)
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute, 0)
  // Two passes settle the DST changeover, where the first guess lands in the
  // wrong offset by exactly one hour.
  const first = guess - viennaOffsetMinutes(guess) * 60000
  return guess - viennaOffsetMinutes(first) * 60000
}

function toViennaIso(instantMs: number): string {
  const wall = viennaWallClock(instantMs)
  const offset = viennaOffsetMinutes(instantMs)
  const sign = offset >= 0 ? '+' : '-'
  const absolute = Math.abs(offset)
  const stamp = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`
  return `${stamp}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

function source(recordId: string, syncedAtMs: number): SourceRef {
  return { provider: 'mock', recordId, syncedAt: toViennaIso(syncedAtMs) }
}

// ── zone helpers ─────────────────────────────────────────────────────────────

function zoneNumber(index: number): 1 | 2 | 3 | 4 | 5 {
  if (index <= 0) return 1
  if (index === 1) return 2
  if (index === 2) return 3
  if (index === 3) return 4
  return 5
}

/**
 * Splits a duration across the five zones so the tuple sums to exactly the
 * activity duration; the rounding remainder goes to the dominant zone.
 */
function distributeSeconds(total: number, weights: ZoneWeights): ZoneSeconds {
  const sum = weights[0] + weights[1] + weights[2] + weights[3] + weights[4]
  if (total <= 0 || sum <= 0) return [0, 0, 0, 0, 0]
  const values: [number, number, number, number, number] = [
    Math.floor((total * weights[0]) / sum),
    Math.floor((total * weights[1]) / sum),
    Math.floor((total * weights[2]) / sum),
    Math.floor((total * weights[3]) / sum),
    Math.floor((total * weights[4]) / sum),
  ]
  let dominant = 0
  for (let i = 1; i < 5; i += 1) {
    if ((weights[i] ?? 0) > (weights[dominant] ?? 0)) dominant = i
  }
  const rest = total - (values[0] + values[1] + values[2] + values[3] + values[4])
  values[dominant] = (values[dominant] ?? 0) + rest
  return values
}

function jitterWeights(rng: Rng, weights: ZoneWeights): ZoneWeights {
  return [
    weights[0] * randRange(rng, 0.85, 1.15),
    weights[1] * randRange(rng, 0.9, 1.1),
    weights[2] * randRange(rng, 0.82, 1.2),
    weights[3] * randRange(rng, 0.75, 1.3),
    weights[4] * randRange(rng, 0.6, 1.45),
  ]
}

// ── training zones ───────────────────────────────────────────────────────────

const HEART_RATE_ZONE_LABELS: readonly [string, string, string, string, string] = [
  'Regeneration',
  'Grundlagenausdauer 1',
  'Grundlagenausdauer 2',
  'Entwicklungsbereich',
  'Spitzenbereich',
]

const POWER_ZONE_LABELS: readonly [string, string, string, string, string] = [
  'Regeneration',
  'Grundlagenausdauer',
  'Tempo',
  'Schwelle',
  'Spitzenbereich',
]

function buildZones(
  basis: number,
  fractions: readonly [number, number, number, number, number],
  labels: readonly [string, string, string, string, string],
): ZoneBoundary[] {
  const cuts = fractions.map((fraction) => Math.round(basis * fraction))
  const boundaries: ZoneBoundary[] = []
  for (let i = 0; i < 5; i += 1) {
    const min = cuts[i] ?? 0
    const nextMin = cuts[i + 1]
    boundaries.push({
      zone: zoneNumber(i),
      label: labels[i] ?? '',
      min,
      max: nextMin === undefined ? null : nextMin - 1,
    })
  }
  return boundaries
}

function buildHeartRateZones(maxHeartRate: number): TrainingZoneSet {
  return {
    kind: 'heart_rate',
    boundaries: buildZones(maxHeartRate, [0.5, 0.6, 0.7, 0.8, 0.9], HEART_RATE_ZONE_LABELS),
    maxHeartRate,
  }
}

function buildPowerZones(ftpWatts: number): TrainingZoneSet {
  return {
    kind: 'power',
    boundaries: buildZones(ftpWatts, [0, 0.56, 0.76, 0.91, 1.06], POWER_ZONE_LABELS),
    ftpWatts,
  }
}

function buildSettings(): UserSettings {
  return {
    userId: USER_ID,
    displayName: 'Lucas',
    locale: 'de-AT',
    weeklyGoals: {
      durationSec: 15 * 3600,
      distanceM: 400000,
      elevationGainM: 4000,
    },
    heartRateZones: buildHeartRateZones(MAX_HEART_RATE),
    powerZones: buildPowerZones(FTP_WATTS),
  }
}

// ── session catalogue ────────────────────────────────────────────────────────

type SessionKind =
  | 'long'
  | 'endurance'
  | 'intervals'
  | 'indoor'
  | 'recovery'
  | 'run'
  | 'hike'
  | 'strength'

interface SessionSpec {
  type: ActivityType
  names: readonly [string, ...string[]]
  /** Nominal hours; the week plan scales these to hit the weekly volume. */
  weightHours: number
  hours: Range
  speedMps: Range
  elevationPerKm: Range
  avgHeartRate: Range
  maxHeartRateDelta: Range
  hrShapeGain: number
  avgPower: Range | null
  normalizedPowerFactor: Range
  powerShapeGain: number
  /** kcal per hour, used only when the session has no power meter data. */
  kcalPerHour: number | null
  strainFactor: number
  cadence: Range
  hrZoneWeights: ZoneWeights
  powerZoneWeights: ZoneWeights | null
  startHour: Range
  preferredDays: readonly number[]
  hasGps: boolean
  hasStreams: boolean
}

const SESSIONS: Record<SessionKind, SessionSpec> = {
  long: {
    type: 'ride',
    names: [
      'Lange Ausfahrt Wienerwald',
      'Lange Runde Klosterneuburg',
      'Ausfahrt Kahlenberg und Leopoldsberg',
      'Lange Ausfahrt Richtung Tulln',
      'Hausberg-Runde Sophienalpe',
      'Lange Ausfahrt Hohe Wand',
    ],
    weightHours: 3.3,
    hours: [3, 5],
    speedMps: [7.2, 8.3],
    elevationPerKm: [12, 18],
    avgHeartRate: [131, 143],
    maxHeartRateDelta: [30, 44],
    hrShapeGain: 0.45,
    avgPower: [172, 198],
    normalizedPowerFactor: [1.06, 1.13],
    powerShapeGain: 0.55,
    kcalPerHour: null,
    strainFactor: 1.4,
    cadence: [82, 90],
    hrZoneWeights: [10, 58, 22, 8, 2],
    powerZoneWeights: [26, 40, 18, 10, 6],
    startHour: [7.75, 9.75],
    preferredDays: [5, 6],
    hasGps: true,
    hasStreams: true,
  },
  endurance: {
    type: 'ride',
    names: [
      'Grundlagenausfahrt',
      'Runde durch die Lobau',
      'Ausfahrt Donauinsel',
      'Feierabendrunde',
      'Grundlage Marchfeld',
    ],
    weightHours: 1.5,
    hours: [1.2, 2.7],
    speedMps: [7.5, 8.6],
    elevationPerKm: [9, 14],
    avgHeartRate: [136, 147],
    maxHeartRateDelta: [24, 36],
    hrShapeGain: 0.5,
    avgPower: [188, 212],
    normalizedPowerFactor: [1.04, 1.1],
    powerShapeGain: 0.5,
    kcalPerHour: null,
    strainFactor: 1.55,
    cadence: [84, 92],
    hrZoneWeights: [8, 60, 24, 7, 1],
    powerZoneWeights: [20, 44, 20, 11, 5],
    startHour: [16.5, 18.25],
    preferredDays: [3, 4, 2],
    hasGps: true,
    hasStreams: true,
  },
  intervals: {
    type: 'ride',
    names: [
      'Intervalle 4x8',
      'Intervalle 5x5',
      'Schwellenintervalle 3x12',
      'Sweetspot 3x20',
      'Bergintervalle Kahlenberg',
    ],
    weightHours: 1.4,
    hours: [1.1, 2.1],
    speedMps: [7.8, 9],
    elevationPerKm: [6, 12],
    avgHeartRate: [147, 159],
    maxHeartRateDelta: [22, 32],
    hrShapeGain: 0.85,
    avgPower: [208, 236],
    normalizedPowerFactor: [1.09, 1.17],
    powerShapeGain: 0.45,
    kcalPerHour: null,
    strainFactor: 2.6,
    cadence: [86, 95],
    hrZoneWeights: [14, 34, 16, 26, 10],
    powerZoneWeights: [24, 30, 12, 22, 12],
    startHour: [16.75, 18.5],
    preferredDays: [1, 2],
    hasGps: true,
    hasStreams: true,
  },
  indoor: {
    type: 'indoor_ride',
    names: [
      'Rolle Grundlage',
      'Rolle Intervalle 4x8',
      'Rolle Sweetspot',
      'Rolle Kraftausdauer',
      'Rolle Ausrollen',
    ],
    weightHours: 1.2,
    hours: [0.85, 1.75],
    speedMps: [8, 8.9],
    elevationPerKm: [0, 0],
    avgHeartRate: [138, 151],
    maxHeartRateDelta: [20, 32],
    hrShapeGain: 0.6,
    avgPower: [196, 222],
    normalizedPowerFactor: [1.02, 1.07],
    powerShapeGain: 0.4,
    kcalPerHour: null,
    strainFactor: 1.95,
    cadence: [87, 95],
    hrZoneWeights: [9, 48, 25, 15, 3],
    powerZoneWeights: [12, 46, 24, 13, 5],
    startHour: [17.5, 19.5],
    preferredDays: [1, 2, 3, 4],
    hasGps: false,
    hasStreams: true,
  },
  recovery: {
    type: 'ride',
    names: ['Regenerationsrunde', 'Lockere Runde Prater', 'Ausrollen Donaukanal'],
    weightHours: 1,
    hours: [0.7, 1.35],
    speedMps: [6.1, 6.9],
    elevationPerKm: [5, 9],
    avgHeartRate: [111, 123],
    maxHeartRateDelta: [22, 32],
    hrShapeGain: 0.35,
    avgPower: [118, 142],
    normalizedPowerFactor: [1.02, 1.07],
    powerShapeGain: 0.35,
    kcalPerHour: null,
    strainFactor: 0.8,
    cadence: [78, 86],
    hrZoneWeights: [42, 52, 6, 0, 0],
    powerZoneWeights: [58, 36, 4, 1, 1],
    startHour: [16.5, 18],
    preferredDays: [0, 6, 4],
    hasGps: true,
    hasStreams: true,
  },
  run: {
    type: 'run',
    names: ['Dauerlauf Prater', 'Laufrunde Donaukanal', 'Lockerer Dauerlauf', 'Laufrunde Steinhof'],
    weightHours: 0.9,
    hours: [0.65, 1.25],
    speedMps: [2.7, 3.3],
    elevationPerKm: [5, 13],
    avgHeartRate: [144, 156],
    maxHeartRateDelta: [20, 30],
    hrShapeGain: 0.5,
    // No running power meter in this setup: the field stays null on purpose.
    avgPower: null,
    normalizedPowerFactor: [1, 1],
    powerShapeGain: 0,
    kcalPerHour: 760,
    strainFactor: 2.2,
    cadence: [82, 88],
    hrZoneWeights: [7, 38, 32, 19, 4],
    powerZoneWeights: null,
    startHour: [17.25, 18.75],
    preferredDays: [1, 3],
    hasGps: true,
    hasStreams: false,
  },
  hike: {
    type: 'hike',
    names: ['Bergtour Rax', 'Wanderung Schneeberg', 'Bergtour Hohe Wand', 'Wanderung Peilstein'],
    weightHours: 3,
    hours: [2.4, 4.3],
    speedMps: [1.1, 1.4],
    elevationPerKm: [58, 92],
    avgHeartRate: [117, 131],
    maxHeartRateDelta: [26, 38],
    hrShapeGain: 0.45,
    avgPower: null,
    normalizedPowerFactor: [1, 1],
    powerShapeGain: 0,
    kcalPerHour: 430,
    strainFactor: 1.1,
    cadence: [0, 0],
    hrZoneWeights: [30, 52, 15, 3, 0],
    powerZoneWeights: null,
    startHour: [7.5, 9.25],
    preferredDays: [6, 5],
    hasGps: true,
    hasStreams: false,
  },
  strength: {
    type: 'strength',
    names: [
      'Krafttraining Beine',
      'Krafttraining Ganzkörper',
      'Stabilisation und Rumpf',
      'Krafttraining Oberkörper',
    ],
    weightHours: 0.85,
    hours: [0.7, 1.1],
    speedMps: [0, 0],
    elevationPerKm: [0, 0],
    avgHeartRate: [107, 121],
    maxHeartRateDelta: [28, 42],
    hrShapeGain: 0.6,
    avgPower: null,
    normalizedPowerFactor: [1, 1],
    powerShapeGain: 0,
    kcalPerHour: 340,
    strainFactor: 1.4,
    cadence: [0, 0],
    hrZoneWeights: [46, 38, 12, 4, 0],
    powerZoneWeights: null,
    startHour: [18.25, 19.5],
    preferredDays: [0, 2],
    hasGps: false,
    hasStreams: false,
  },
}

/**
 * Drawn from without replacement to fill a week out to four to six sessions.
 * The repetition is the weighting: indoor rides are common, a mountain hike is
 * a once-in-a-few-weeks thing.
 */
const EXTRA_SESSIONS: readonly [SessionKind, ...SessionKind[]] = [
  'indoor',
  'indoor',
  'indoor',
  'recovery',
  'recovery',
  'run',
  'run',
  'strength',
  'strength',
  'hike',
]

// ── week planning ────────────────────────────────────────────────────────────

interface PlannedSession {
  kind: SessionKind
  dayOffset: number
}

function planWeek(rng: Rng, isRecoveryWeek: boolean): PlannedSession[] {
  const kinds: SessionKind[] = isRecoveryWeek
    ? ['long', 'endurance', 'indoor', 'recovery']
    : ['long', 'endurance', 'intervals']

  if (isRecoveryWeek) {
    if (rng() < 0.45) kinds.push('strength')
  } else {
    const extras = randInt(rng, 1, 3)
    const pool: SessionKind[] = [...EXTRA_SESSIONS]
    for (let i = 0; i < extras; i += 1) {
      const index = Math.floor(rng() * pool.length)
      const chosen = pool[index] ?? 'indoor'
      pool.splice(index, 1)
      // A second long weekend session is unrealistic; drop the hike instead.
      if (chosen === 'hike' && kinds.includes('hike')) continue
      kinds.push(chosen)
    }
  }

  const taken = new Set<number>()
  const planned: PlannedSession[] = []
  for (const kind of kinds) {
    const spec = SESSIONS[kind]
    let dayOffset = -1
    for (const day of spec.preferredDays) {
      if (!taken.has(day)) {
        dayOffset = day
        break
      }
    }
    if (dayOffset < 0) {
      for (let day = 0; day < 7; day += 1) {
        if (!taken.has(day)) {
          dayOffset = day
          break
        }
      }
    }
    if (dayOffset < 0) continue
    taken.add(dayOffset)
    planned.push({ kind, dayOffset })
  }
  return planned.sort((a, b) => a.dayOffset - b.dayOffset)
}

// ── effort shape, shared by every stream ─────────────────────────────────────

interface ShapeParams {
  phaseA: number
  phaseB: number
  freqA: number
  freqB: number
  reps: number
}

/** Normalised effort over the ride, roughly -0.9 (coasting) to 1.0 (block). */
function effortShape(kind: SessionKind, progress: number, params: ShapeParams): number {
  if (kind === 'intervals') {
    if (progress < 0.22) return -0.35 + progress * 1.6
    if (progress > 0.88) return -0.5
    const position = ((progress - 0.22) / 0.66) * params.reps
    return position - Math.floor(position) < 0.6 ? 1 : -0.42
  }
  const wave =
    0.34 * Math.sin(progress * Math.PI * 2 * params.freqA + params.phaseA) +
    0.18 * Math.sin(progress * Math.PI * 2 * params.freqB + params.phaseB)
  if (progress < 0.08) return wave - 0.45 * (1 - progress / 0.08)
  if (progress > 0.94) return wave - 0.4 * ((progress - 0.94) / 0.06)
  return wave
}

// ── streams ──────────────────────────────────────────────────────────────────

const SAMPLE_INTERVAL_SEC = 10

function buildStreams(rng: Rng, activity: Activity, kind: SessionKind): ActivityStreams {
  const spec = SESSIONS[kind]
  const count = Math.floor(activity.durationSec / SAMPLE_INTERVAL_SEC) + 1
  const params: ShapeParams = {
    phaseA: randRange(rng, 0, Math.PI * 2),
    phaseB: randRange(rng, 0, Math.PI * 2),
    freqA: randRange(rng, 2.2, 4.6),
    freqB: randRange(rng, 6.5, 11),
    reps: randInt(rng, 3, 6),
  }

  const timeSec: number[] = []
  for (let i = 0; i < count; i += 1) timeSec.push(i * SAMPLE_INTERVAL_SEC)

  // Altitude first: the gradient drives the speed trace.
  let altitudeM: number[] | null = null
  const gradients: number[] = new Array<number>(count).fill(0)
  if (activity.hasGps && (activity.elevationGainM ?? 0) > 0) {
    // Integer frequencies keep the profile periodic, so a loop finishes at the
    // altitude it started at instead of drifting.
    const climbs = randInt(rng, 3, 6)
    const phase = randRange(rng, 0, Math.PI * 2)
    const raw: number[] = []
    let ascent = 0
    let previous = 0
    for (let i = 0; i < count; i += 1) {
      const progress = count > 1 ? i / (count - 1) : 0
      const value =
        Math.sin(progress * Math.PI * 2 * climbs + phase) +
        0.4 * Math.sin(progress * Math.PI * 2 * climbs * 2 + phase * 1.7) +
        0.6 * Math.sin(progress * Math.PI * 2 + phase * 0.4)
      if (i > 0 && value > previous) ascent += value - previous
      previous = value
      raw.push(value)
    }
    const scale = ascent > 0 ? (activity.elevationGainM ?? 0) / ascent : 0
    altitudeM = raw.map((value) => round(HOME_ALTITUDE_M + value * scale, 1))
    const metresPerSample = (activity.distanceM ?? 0) / Math.max(1, count - 1)
    let previousAltitude = altitudeM[0] ?? HOME_ALTITUDE_M
    for (let i = 0; i < count; i += 1) {
      const current = altitudeM[i] ?? previousAltitude
      gradients[i] = metresPerSample > 0 ? (current - previousAltitude) / metresPerSample : 0
      previousAltitude = current
    }
  }

  const heartRate: number[] = []
  const power: number[] | null = spec.avgPower ? [] : null
  const speedMps: number[] = []
  const cadence: number[] = []

  const avgHr = activity.avgHeartRate ?? 130
  const maxHr = activity.maxHeartRate ?? avgHr + 30
  const avgPower = activity.avgPower ?? 0
  const avgSpeed = activity.avgSpeedMps ?? 0
  const cadenceBase = randIn(rng, spec.cadence)
  let heartRateState = avgHr * 0.68
  let powerState = avgPower * 0.6

  for (let i = 0; i < count; i += 1) {
    const progress = count > 1 ? i / (count - 1) : 0
    const shape = effortShape(kind, progress, params)
    const warmup = 1 - Math.exp(-progress * 16)

    const hrTarget =
      avgHr * (0.78 + 0.22 * warmup) +
      (maxHr - avgHr) * spec.hrShapeGain * shape +
      progress * 3 +
      randRange(rng, -2.5, 2.5)
    // Heart rate lags effort; the smoothing factor stands in for that lag.
    heartRateState += (hrTarget - heartRateState) * 0.12
    heartRate.push(clamp(Math.round(heartRateState), 75, maxHr))

    let sampleWatts = 0
    if (power) {
      const powerTarget =
        avgPower * (1 + spec.powerShapeGain * shape) * (0.55 + 0.45 * warmup) +
        randRange(rng, -0.16, 0.16) * avgPower
      powerState += (powerTarget - powerState) * 0.45
      sampleWatts = clamp(Math.round(powerState), 0, Math.round(avgPower * 3))
      power.push(sampleWatts)
    }

    const gradient = clamp(gradients[i] ?? 0, -0.14, 0.14)
    const raw = avgSpeed * (1 - gradient * 4.5) * (0.9 + 0.14 * shape) + randRange(rng, -0.5, 0.5)
    speedMps.push(clamp(raw, avgSpeed > 0 ? 1.2 : 0, avgSpeed * 2.1))

    const coasting = power !== null && sampleWatts < 20
    cadence.push(coasting ? 0 : clamp(Math.round(cadenceBase + 11 * shape + randRange(rng, -4, 4)), 50, 112))
  }

  // Nudge the trace so its mean matches the reported average speed.
  let speedSum = 0
  for (const value of speedMps) speedSum += value
  const speedMean = speedSum / Math.max(1, speedMps.length)
  const correction = speedMean > 0 && avgSpeed > 0 ? avgSpeed / speedMean : 1
  const correctedSpeed = speedMps.map((value) => round(value * correction, 2))

  let latLng: Array<[number, number]> | null = null
  if (activity.hasGps) {
    const distanceKm = (activity.distanceM ?? 0) / 1000
    const radiusKm = clamp(distanceKm / (2 * Math.PI), 1.5, 26)
    const radiusLat = radiusKm / 111.32
    const radiusLng = radiusKm / 74.2
    const wobblePhase = randRange(rng, 0, Math.PI * 2)
    const wobbleFreq = randInt(rng, 2, 4)
    latLng = []
    for (let i = 0; i < count; i += 1) {
      const progress = count > 1 ? i / (count - 1) : 0
      const angle = progress * Math.PI * 2
      const wobble = 1 + 0.28 * Math.sin(angle * wobbleFreq + wobblePhase)
      latLng.push([
        round(HOME_LAT + radiusLat * wobble * Math.sin(angle), 5),
        round(HOME_LNG + radiusLng * wobble * (Math.cos(angle) - 1), 5),
      ])
    }
  }

  return {
    activityId: activity.id,
    timeSec,
    heartRate,
    power,
    speedMps: correctedSpeed,
    altitudeM,
    cadence,
    latLng,
  }
}

// ── activities ───────────────────────────────────────────────────────────────

interface BuiltActivity {
  activity: Activity
  kind: SessionKind
}

function buildActivity(
  rng: Rng,
  kind: SessionKind,
  dayKey: string,
  scale: number,
  isRecoveryWeek: boolean,
): BuiltActivity {
  const spec = SESSIONS[kind]
  const lower = kind === 'long' && isRecoveryWeek ? 1.9 : spec.hours[0]
  const upper = kind === 'long' && isRecoveryWeek ? 2.8 : spec.hours[1]
  const hours = clamp(spec.weightHours * scale * randRange(rng, 0.92, 1.09), lower, upper)
  const durationSec = Math.round((hours * 3600) / SAMPLE_INTERVAL_SEC) * SAMPLE_INTERVAL_SEC
  const actualHours = durationSec / 3600

  const hasDistance = spec.speedMps[1] > 0
  const plannedSpeed = hasDistance ? randIn(rng, spec.speedMps) : 0
  const distanceM = hasDistance ? Math.round(durationSec * plannedSpeed) : null
  const avgSpeedMps = distanceM !== null ? round(distanceM / durationSec, 2) : null

  const elevationGainM =
    spec.type === 'indoor_ride'
      ? 0
      : distanceM === null
        ? null
        : Math.round((distanceM / 1000) * randIn(rng, spec.elevationPerKm))

  const avgHeartRate = Math.round(randIn(rng, spec.avgHeartRate))
  const maxHeartRate = Math.min(
    MAX_HEART_RATE,
    avgHeartRate + Math.round(randIn(rng, spec.maxHeartRateDelta)),
  )

  const avgPower = spec.avgPower ? Math.round(randIn(rng, spec.avgPower)) : null
  const normalizedPower =
    avgPower === null
      ? null
      : Math.max(avgPower, Math.round(avgPower * randIn(rng, spec.normalizedPowerFactor)))

  const calories =
    avgPower !== null
      ? Math.round(((avgPower * durationSec) / 1000) * randRange(rng, 0.98, 1.06))
      : spec.kcalPerHour !== null
        ? Math.round(spec.kcalPerHour * actualHours * randRange(rng, 0.94, 1.07))
        : null

  // Whoop-style strain saturates towards 21 instead of growing linearly.
  const trainingLoad = round(
    clamp(21 * (1 - Math.exp(-(actualHours * spec.strainFactor) / 3)), 2.8, 20.8),
    1,
  )

  const startHourFloat = randIn(rng, spec.startHour)
  let startHour = Math.floor(startHourFloat)
  let startMinute = Math.round(((startHourFloat - startHour) * 60) / 5) * 5
  if (startMinute >= 60) {
    startHour += 1
    startMinute = 0
  }
  const startedAtMs = viennaInstant(dayKey, startHour, startMinute)
  const elapsedSec =
    durationSec +
    Math.round(durationSec * (spec.type === 'indoor_ride' ? randRange(rng, 0, 0.02) : randRange(rng, 0.02, 0.12)))

  const id = `act-${dayKey}-${kind}`
  const activity: Activity = {
    id,
    userId: USER_ID,
    source: source(`mock:${id}`, startedAtMs + elapsedSec * 1000 + 5 * 60000),
    type: spec.type,
    name: pick(rng, spec.names),
    startedAt: toViennaIso(startedAtMs),
    timezone: TIMEZONE,
    durationSec,
    elapsedSec,
    distanceM,
    elevationGainM,
    avgSpeedMps,
    avgHeartRate,
    maxHeartRate,
    avgPower,
    normalizedPower,
    calories,
    trainingLoad,
    trainingLoadKind: 'whoop_strain',
    hrZoneSec: distributeSeconds(durationSec, jitterWeights(rng, spec.hrZoneWeights)),
    powerZoneSec: spec.powerZoneWeights
      ? distributeSeconds(durationSec, jitterWeights(rng, spec.powerZoneWeights))
      : null,
    hasGps: spec.hasGps,
  }
  return { activity, kind }
}

// ── the dataset ──────────────────────────────────────────────────────────────

export function generateMockDataset(today: Date): MockDataset {
  const rng = createRng(SEED)
  const currentMonday = startOfWeek(today)
  const historyStart = addDays(currentMonday, -7 * (HISTORY_WEEKS - 1))
  const todayKey = toDayKey(today)
  const firstDayKey = toDayKey(historyStart)

  const dayKeys: string[] = []
  let cursor = historyStart
  while (toDayKey(cursor) <= todayKey) {
    dayKeys.push(toDayKey(cursor))
    cursor = addDays(cursor, 1)
  }

  // ── activities and streams ──
  const activities: Activity[] = []
  const streams: Record<string, ActivityStreams> = {}

  for (let week = 0; week < HISTORY_WEEKS; week += 1) {
    // Every fourth week is a down week; the offset keeps the current week
    // (the one the overview lands on) a normal build week.
    const isRecoveryWeek = week % 4 === 2
    const weekStart = addDays(historyStart, week * 7)
    const planned = planWeek(rng, isRecoveryWeek)

    let plannedHours = 0
    for (const session of planned) plannedHours += SESSIONS[session.kind].weightHours

    const baseHours = 10.2 + week * 0.14 + randRange(rng, -0.9, 1.4)
    const targetHours = clamp(
      isRecoveryWeek ? baseHours * 0.55 : baseHours,
      isRecoveryWeek ? 4.6 : 8.8,
      14.6,
    )
    const scale = clamp(plannedHours > 0 ? targetHours / plannedHours : 1, 0.78, 1.45)

    for (const session of planned) {
      const dayKey = toDayKey(addDays(weekStart, session.dayOffset))
      if (dayKey > todayKey || dayKey < firstDayKey) continue
      const built = buildActivity(rng, session.kind, dayKey, scale, isRecoveryWeek)
      activities.push(built.activity)
      if (SESSIONS[built.kind].hasStreams) {
        streams[built.activity.id] = buildStreams(rng, built.activity, built.kind)
      }
    }
  }

  activities.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  const strainByDay = new Map<string, number>()
  for (const activity of activities) {
    const dayKey = activity.startedAt.slice(0, 10)
    strainByDay.set(dayKey, (strainByDay.get(dayKey) ?? 0) + (activity.trainingLoad ?? 0))
  }
  const strainAt = (index: number): number => {
    const key = dayKeys[index]
    return key === undefined ? 0 : (strainByDay.get(key) ?? 0)
  }

  // ── daily health, sleep and recovery ──
  const dailyHealth: DailyHealthMetrics[] = []
  const sleep: SleepSession[] = []
  const recovery: RecoveryMetric[] = []

  const hrvPhaseA = randRange(rng, 0, Math.PI * 2)
  const hrvPhaseB = randRange(rng, 0, Math.PI * 2)
  const tempPhase = randRange(rng, 0, Math.PI * 2)
  const weightPhase = randRange(rng, 0, Math.PI * 2)
  const sleepPhase = randRange(rng, 0, Math.PI * 2)

  for (let index = 0; index < dayKeys.length; index += 1) {
    const dayKey = dayKeys[index]
    if (dayKey === undefined) continue
    const previousDayKey = toDayKey(addDays(fromDayKey(dayKey), -1))

    const yesterdayStrain = strainAt(index - 1)
    const beforeStrain = strainAt(index - 2)
    let laggedWeekStrain = 0
    for (let back = 2; back <= 8; back += 1) laggedWeekStrain += strainAt(index - back)

    // HRV rides on a slow personal baseline and sags after hard days.
    const baseline =
      72 + 8 * Math.sin(index / 23.5 + hrvPhaseA) + 5 * Math.sin(index / 11.2 + hrvPhaseB)
    const hrvValue = clamp(
      baseline -
        (0.62 * yesterdayStrain + 0.35 * beforeStrain) -
        Math.max(0, laggedWeekStrain - 55) * 0.08 +
        randRange(rng, -4, 4),
      35,
      95,
    )
    const restingHeartRateValue = clamp(
      48 - (hrvValue - 70) * 0.22 + 0.07 * yesterdayStrain + randRange(rng, -1.3, 1.3),
      42,
      56,
    )
    const respiratoryRateValue = clamp(
      14.4 + (68 - hrvValue) * 0.03 + randRange(rng, -0.7, 0.7),
      13,
      16,
    )
    const skinTemperatureValue = clamp(
      34 + 0.45 * Math.sin(index / 9.3 + tempPhase) + randRange(rng, -0.45, 0.45),
      33,
      35,
    )
    const bloodOxygenValue = clamp(96.6 + randRange(rng, -2.1, 2.2), 94, 99)
    const weightValue = clamp(
      72.4 + 0.7 * Math.sin(index / 29 + weightPhase) - index * 0.0035 + randRange(rng, -0.35, 0.35),
      69,
      75,
    )

    // A day without the strap on: the whole row goes missing, not just one field.
    const strapOff = rng() < 0.018
    const missing = (probability: number): boolean => strapOff || rng() < probability

    // Decided once per day, because the daily row and the recovery row describe
    // the same measurement from the same strap.
    const hrvMissing = missing(0.035)
    const restingHeartRateMissing = missing(0.035)
    const respiratoryRateMissing = missing(0.035)

    const healthSyncedAt = viennaInstant(dayKey, 7, 15)
    dailyHealth.push({
      date: dayKey,
      userId: USER_ID,
      source: source(`mock:health:${dayKey}`, healthSyncedAt),
      hrvMs: hrvMissing ? null : Math.round(hrvValue),
      restingHeartRate: restingHeartRateMissing ? null : Math.round(restingHeartRateValue),
      respiratoryRate: respiratoryRateMissing ? null : round(respiratoryRateValue, 1),
      skinTemperatureC: missing(0.045) ? null : round(skinTemperatureValue, 1),
      bloodOxygenPct: missing(0.045) ? null : round(bloodOxygenValue, 1),
      // The scale is not stepped on every single morning.
      weightKg: missing(0.1) ? null : round(weightValue, 1),
    })

    const weekday = fromDayKey(dayKey).getDay()
    const isWeekendMorning = weekday === 0 || weekday === 6
    const sleepHours = clamp(
      7.3 +
        0.55 * Math.sin(index / 6.1 + sleepPhase) +
        (isWeekendMorning ? 0.5 : 0) -
        yesterdayStrain * 0.012 +
        randRange(rng, -1, 1.1),
      5.5,
      9,
    )
    const sleepDurationSec = Math.round(sleepHours * 3600)
    const timeInBedSec = sleepDurationSec + randInt(rng, 900, 3600)
    const efficiency = sleepDurationSec / timeInBedSec
    const sleepScoreValue = clamp(
      Math.round(48 + (sleepHours - 5.5) * 11 + (efficiency - 0.85) * 130 + randRange(rng, -6, 6)),
      55,
      99,
    )
    const bedtimeFloat = randRange(rng, 21.7, 23.8)
    const bedHour = Math.floor(bedtimeFloat)
    const bedMinute = Math.min(59, Math.round((bedtimeFloat - bedHour) * 60))
    const sleepStartMs = viennaInstant(previousDayKey, bedHour, bedMinute)
    const sleepEndMs = sleepStartMs + timeInBedSec * 1000

    const deepSec = Math.round(sleepDurationSec * randRange(rng, 0.16, 0.23))
    const remSec = Math.round(sleepDurationSec * randRange(rng, 0.19, 0.26))
    const stagesMissing = missing(0.04)
    sleep.push({
      id: `sleep-${dayKey}`,
      userId: USER_ID,
      source: source(`mock:sleep:${dayKey}`, sleepEndMs + 12 * 60000),
      date: dayKey,
      startedAt: toViennaIso(sleepStartMs),
      endedAt: toViennaIso(sleepEndMs),
      durationSec: sleepDurationSec,
      timeInBedSec,
      sleepScore: stagesMissing ? null : sleepScoreValue,
      stages: stagesMissing
        ? null
        : {
            remSec,
            deepSec,
            lightSec: sleepDurationSec - deepSec - remSec,
            awakeSec: timeInBedSec - sleepDurationSec,
          },
      respiratoryRate: respiratoryRateMissing
        ? null
        : round(clamp(respiratoryRateValue + randRange(rng, -0.2, 0.2), 13, 16), 1),
    })

    const todayStrain = strainAt(index)
    const recoveryScoreValue = clamp(
      Math.round(
        64 +
          (hrvValue - 70) * 1.3 +
          (sleepScoreValue - 78) * 0.32 -
          0.22 * yesterdayStrain +
          randRange(rng, -5, 5),
      ),
      20,
      99,
    )
    const dayStrainValue = clamp(
      5 + todayStrain * 0.72 + randRange(rng, 0, 1.6),
      5,
      19,
    )
    recovery.push({
      id: `recovery-${dayKey}`,
      userId: USER_ID,
      source: source(`mock:recovery:${dayKey}`, healthSyncedAt),
      date: dayKey,
      providerScore: missing(0.04) ? null : recoveryScoreValue,
      dayStrain: round(dayStrainValue, 1),
      hrvMs: hrvMissing ? null : Math.round(hrvValue),
      restingHeartRate: restingHeartRateMissing ? null : Math.round(restingHeartRateValue),
    })
  }

  return {
    settings: buildSettings(),
    activities,
    streams,
    dailyHealth,
    sleep,
    recovery,
  }
}
