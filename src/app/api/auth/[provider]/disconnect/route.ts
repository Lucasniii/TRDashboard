import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type { ProviderId } from '@/lib/domain/types'
import { getAdapter } from '@/lib/providers/registry'
import { deleteByProvider } from '@/lib/store/records'
import { clearUserConnection } from '@/lib/store/user-tokens'

/**
 * Disconnecting drops the tokens and every record the provider ever delivered.
 * That is the honest reading of "trennen": leaving orphaned rows behind would
 * keep showing data the user believes they revoked, and a re-connect re-imports
 * the window anyway.
 */

export const dynamic = 'force-dynamic'

function parseProvider(value: string): ProviderId | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getAdapter(value) === null ? null : value
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider: raw } = await context.params
  const provider = parseProvider(raw)
  if (provider === null) {
    return NextResponse.json({ error: 'Unbekannte Datenquelle.' }, { status: 404 })
  }

  const user = await getCurrentUser()
  if (user === null) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  await clearUserConnection(user.id, provider)
  const removed = await deleteByProvider(user.id, provider)

  // Every page reads these records, so the whole tree has to refetch.
  revalidatePath('/', 'layout')

  return NextResponse.json({ ok: true, removed })
}
