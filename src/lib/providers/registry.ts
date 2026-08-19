import type { DataSourceStatus, ProviderCapabilities, ProviderId } from '@/lib/domain/types'
import type { ProviderAdapter } from './types'
import { wahooAdapter } from './wahoo'
import { whoopAdapter } from './whoop'

/**
 * One place that knows which platforms exist, what each of them can deliver and
 * which of them already have a working adapter. Adding a provider means writing
 * the adapter and adding two entries here — nothing above this layer changes.
 *
 * The adapters read credentials from the environment, so this module belongs on
 * the server. The UI gets its `DataSourceStatus` list through the repository.
 */

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  whoop: 'WHOOP',
  wahoo: 'Wahoo',
  strava: 'Strava',
  garmin: 'Garmin Connect',
  apple_health: 'Apple Health',
  wub: 'WUB',
  csv: 'CSV-Import',
  manual: 'Manuelle Eingabe',
  mock: 'Beispieldaten',
}

const NOTHING: ProviderCapabilities = {
  activities: false,
  activityStreams: false,
  gps: false,
  hrZones: false,
  powerZones: false,
  hrv: false,
  restingHeartRate: false,
  sleep: false,
  recoveryScore: false,
  weight: false,
}

/**
 * What each platform delivers. The two implemented adapters answer for
 * themselves; the rest are stubs that describe the planned integration. They
 * stay unconfigured and unconnected until an adapter exists, so the UI degrades
 * on `connected` long before it looks at a capability flag.
 */
export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  whoop: whoopAdapter.capabilities,
  wahoo: wahooAdapter.capabilities,
  strava: {
    ...NOTHING,
    activities: true,
    activityStreams: true,
    gps: true,
    hrZones: true,
    powerZones: true,
    weight: true,
  },
  garmin: {
    activities: true,
    activityStreams: true,
    gps: true,
    hrZones: true,
    powerZones: true,
    hrv: true,
    restingHeartRate: true,
    sleep: true,
    recoveryScore: true,
    weight: true,
  },
  apple_health: {
    ...NOTHING,
    activities: true,
    hrv: true,
    restingHeartRate: true,
    sleep: true,
    weight: true,
  },
  // Capabilities are unknown until the adapter is written.
  wub: { ...NOTHING },
  // A file import delivers whatever its columns hold; only sessions are certain.
  csv: { ...NOTHING, activities: true },
  manual: { ...NOTHING, activities: true },
  // The demo repository fills every view.
  mock: {
    activities: true,
    activityStreams: true,
    gps: true,
    hrZones: true,
    powerZones: true,
    hrv: true,
    restingHeartRate: true,
    sleep: true,
    recoveryScore: true,
    weight: true,
  },
}

/** Only providers listed here can run an OAuth flow and a sync. */
export const PROVIDER_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter>> = {
  whoop: whoopAdapter,
  wahoo: wahooAdapter,
}

export function getAdapter(id: ProviderId): ProviderAdapter | null {
  return PROVIDER_ADAPTERS[id] ?? null
}

/** The credentials are present, so the connect button can be offered. */
export function isProviderConfigured(id: ProviderId): boolean {
  return getAdapter(id)?.isConfigured() ?? false
}

export function getProviderLabel(id: ProviderId): string {
  return PROVIDER_LABELS[id]
}

export function getProviderCapabilities(id: ProviderId): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[id]
}

export interface DataSourceState {
  connected?: boolean
  lastSyncAt?: string | null
}

/** Builds the row the Einstellungen view shows for one data source. */
export function describeDataSource(id: ProviderId, state: DataSourceState = {}): DataSourceStatus {
  return {
    provider: id,
    label: PROVIDER_LABELS[id],
    connected: state.connected ?? false,
    configured: isProviderConfigured(id),
    lastSyncAt: state.lastSyncAt ?? null,
    capabilities: PROVIDER_CAPABILITIES[id],
  }
}

/** Order the sources appear in, real integrations first. */
export const PROVIDER_ORDER: readonly ProviderId[] = [
  'whoop',
  'wahoo',
  'strava',
  'garmin',
  'apple_health',
  'wub',
  'csv',
  'manual',
]

export function describeAllDataSources(
  state: Partial<Record<ProviderId, DataSourceState>> = {},
): DataSourceStatus[] {
  return PROVIDER_ORDER.map((id) => describeDataSource(id, state[id] ?? {}))
}
