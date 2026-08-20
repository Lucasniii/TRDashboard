// server-only: turns an authenticated browser session into the repository key
// used by every private dashboard page.

import { redirect } from 'next/navigation'

import { IS_MOCK_DATA } from '@/lib/data'
import { getCurrentUser } from './session'

/**
 * Demo data deliberately has no account. In every other mode a page must use
 * the id from the opaque session cookie — never a shared fallback id.
 */
export async function requireDashboardUserId(): Promise<string | undefined> {
  if (IS_MOCK_DATA) return undefined

  const user = await getCurrentUser()
  if (user === null) redirect('/anmelden')
  return user.id
}
