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

export function getRepository(userId?: string): HealthDataRepository {
  if (IS_MOCK_DATA) return new MockRepository()
  if (IS_FORMLINE_DATA) return new FormlineRepository()
  if (userId === undefined) throw new Error('Für diese Seite ist eine Anmeldung erforderlich.')
  return new LocalRepository(userId)
}

/** Allows the landing page to distinguish a first run from an empty chart. */
export async function isEmptyState(userId?: string): Promise<boolean> {
  return !IS_MOCK_DATA && (await getRepository(userId).getEarliestRecordDate()) === null
}

export type { HealthDataRepository } from './repository'
