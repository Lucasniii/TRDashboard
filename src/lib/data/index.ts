// server-only: selects the data source and must never be imported by a client
// component.

import { MockRepository } from '@/lib/mock/repository'
import { hasAnyRecords } from '@/lib/store/records'
import { LocalRepository } from './local-repository'
import type { HealthDataRepository } from './repository'

const source = process.env.TRDASHBOARD_DATA_SOURCE?.trim().toLowerCase() ?? 'local'

/** Mock data is opt-in; production always reads its private local store. */
export const IS_MOCK_DATA = source === 'mock'

let repository: HealthDataRepository | null = null

export function getRepository(): HealthDataRepository {
  if (repository === null) repository = IS_MOCK_DATA ? new MockRepository() : new LocalRepository()
  return repository
}

/** Allows the landing page to distinguish a first run from an empty chart. */
export async function isEmptyState(): Promise<boolean> {
  return !IS_MOCK_DATA && !(await hasAnyRecords())
}

export type { HealthDataRepository } from './repository'
