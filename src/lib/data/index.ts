// server-only: selects the data source and must never be imported by a client
// component.

import { MockRepository } from '@/lib/mock/repository'
import { FormlineRepository } from './formline-repository'
import { LocalRepository } from './local-repository'
import type { HealthDataRepository } from './repository'

const source = process.env.TRDASHBOARD_DATA_SOURCE?.trim().toLowerCase() ?? 'local'

/** Mock data is opt-in; production always reads its private local store. */
export const IS_MOCK_DATA = source === 'mock'
const IS_FORMLINE_DATA = source === 'formline'

let repository: HealthDataRepository | null = null

export function getRepository(): HealthDataRepository {
  if (repository === null) {
    repository = IS_MOCK_DATA ? new MockRepository() : IS_FORMLINE_DATA ? new FormlineRepository() : new LocalRepository()
  }
  return repository
}

/** Allows the landing page to distinguish a first run from an empty chart. */
export async function isEmptyState(): Promise<boolean> {
  return !IS_MOCK_DATA && (await getRepository().getEarliestRecordDate()) === null
}

export type { HealthDataRepository } from './repository'
