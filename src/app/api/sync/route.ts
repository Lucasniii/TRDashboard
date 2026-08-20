import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/session'
import type { ProviderId } from '@/lib/domain/types'
import { getAdapter, getProviderLabel } from '@/lib/providers/registry'
import { isUserConnected } from '@/lib/store/user-tokens'
import { syncAllConnected, syncProvider, type SyncOutcome } from '@/lib/sync/run-sync'

/**
 * The manual "Jetzt synchronisieren" endpoint. Without a body it runs every
 * connected provider; with `{ provider }` it runs exactly one.
 *
 * A provider that is simply not connected is a 400 with a German sentence — the
 * caller asked for something impossible. A provider that is connected but fails
 * mid-run is a 200 carrying a `failed` outcome, because the run happened and
 * the other providers may well have succeeded.
 */

export const dynamic = 'force-dynamic'

interface SyncRequestBody {
  provider?: ProviderId
  days?: number
}

function parseProvider(value: unknown): ProviderId | null {
  if (value !== 'whoop' && value !== 'wahoo') return null
  return getAdapter(value) === null ? null : value
}

async function readBody(request: Request): Promise<SyncRequestBody | 'invalid'> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    // No body at all is the common case: sync everything.
    return {}
  }
  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) return 'invalid'

  const candidate = parsed as Record<string, unknown>
  const body: SyncRequestBody = {}

  if (candidate.provider !== undefined && candidate.provider !== null) {
    const provider = parseProvider(candidate.provider)
    if (provider === null) return 'invalid'
    body.provider = provider
  }

  if (candidate.days !== undefined && candidate.days !== null) {
    const days = Number(candidate.days)
    if (!Number.isFinite(days) || days <= 0) return 'invalid'
    body.days = days
  }

  return body
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (user === null) return NextResponse.json({ error: 'Bitte zuerst mit WHOOP anmelden.' }, { status: 401 })
  const body = await readBody(request)
  if (body === 'invalid') {
    return NextResponse.json(
      { error: 'Ungültige Anfrage: Datenquelle oder Zeitraum wird nicht unterstützt.' },
      { status: 400 },
    )
  }

  let outcomes: SyncOutcome[]

  if (body.provider !== undefined) {
    if (!(await isUserConnected(user.id, body.provider))) {
      return NextResponse.json(
        {
          error: `${getProviderLabel(body.provider)} ist nicht verbunden. Bitte zuerst verbinden.`,
        },
        { status: 400 },
      )
    }
    outcomes = [await syncProvider(user.id, body.provider, body.days)]
  } else {
    outcomes = await syncAllConnected(user.id, body.days)
    if (outcomes.length === 0) {
      return NextResponse.json(
        { error: 'Es ist keine Datenquelle verbunden. Bitte zuerst WHOOP oder Wahoo verbinden.' },
        { status: 400 },
      )
    }
  }

  if (outcomes.some((outcome) => outcome.status === 'succeeded')) {
    // Fresh records on disk; every page reads them through the repository.
    revalidatePath('/', 'layout')
  }

  return NextResponse.json({ outcomes })
}
