# Provider integration layer

Every external platform is reached through one interface, `ProviderAdapter`
(`src/lib/providers/types.ts`). The adapter owns the platform's OAuth dialect
and its JSON shapes; everything above it — repository, analytics, charts — sees
only the internal model from `src/lib/domain/types.ts`.

```
OAuth route ──► adapter.getAuthorizationUrl / exchangeCode / refresh ──► ProviderTokens
sync job    ──► adapter.fetch(tokens, range) ──► ProviderFetchResult
                                                   └─► mergeActivities() ──► repository
```

## Files

| File | Responsibility |
| --- | --- |
| `types.ts` | The contract. Do not edit. |
| `mapping.ts` | Pure normalizers, raw JSON in, domain records out. No network, no clock, no environment. |
| `whoop.ts` | WHOOP API v2 adapter. Server-only. |
| `wahoo.ts` | Wahoo Cloud API v1 adapter. Server-only. |
| `registry.ts` | Which providers exist, what they can deliver, which have an adapter. |

## Adding a provider

1. **Add the id.** `ProviderId` in `src/lib/domain/types.ts` is the closed list
   of platforms. (That file is shared — coordinate before touching it.)
2. **Write the normalizers** in `mapping.ts`: one small `interface` per response
   shape you actually read, one `xToActivity` / `xToDaily` / … function per
   record type. Keep them pure and total: a record you cannot describe honestly
   returns `null` and is dropped, a metric the platform did not report becomes
   `null` — never `0`, never a substitute.
3. **Implement `ProviderAdapter`** in `src/lib/providers/<id>.ts`:
   - `isConfigured()` reports whether the client id and secret are in
     `process.env`. Read the environment inside functions, never at module
     scope, and mark the file server-only in a comment at the top.
   - `getAuthorizationUrl`, `exchangeCode`, `refresh` handle the OAuth dance.
     Adapters are stateless: tokens go in and come out, storage happens above.
   - `fetch(tokens, range)` walks the platform's pagination and returns a
     `ProviderFetchResult`. Domains the platform does not have return `[]`.
4. **Declare capabilities** honestly in the adapter's `capabilities` object.
   The flags describe what *this adapter* delivers, not what the platform could
   theoretically do — a series that is only inside a FIT file you never download
   is `activityStreams: false`. The UI degrades on these flags.
5. **Register it** in `registry.ts`: a label in `PROVIDER_LABELS`, the
   capabilities in `PROVIDER_CAPABILITIES`, the instance in `PROVIDER_ADAPTERS`,
   and a place in `PROVIDER_ORDER`. `getAdapter()` returning `null` is what
   marks a platform as "planned but not implemented".

That is the whole extension surface. No page, chart or analytics function
learns that the new provider exists.

## De-duplication

One ride is often recorded twice: by the bike computer and by the strap.
`mergeActivities(activities, byProviderPriority)` folds those into a single
record. Two activities describe the same session when their start times are
within 20 minutes **and** their durations within 15 minutes; records from the
same provider are never merged with each other.

Field by field the better source wins: distance, speed, power and climbing come
from the device (Wahoo, Garmin, Strava), heart rate zones, maxima and training
load from the strap (WHOOP). Identity, name and provenance stay with the
highest-priority provider in the cluster.

## Environment

```
WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET
WAHOO_CLIENT_ID / WAHOO_CLIENT_SECRET
```

Redirect URIs are passed in by the caller, so the same adapter works in
development and production.

## Notes that cost time to rediscover

- **WHOOP needs the `offline` scope**, and the refresh grant has to send
  `scope=offline` again. Without it no refresh token is issued and the
  connection dies when the first access token expires.
- **WHOOP recovery rows have no id of their own.** They are keyed by `cycle_id`,
  and the day strain lives on the matching `/v2/cycle` record, not on the
  recovery record.
- **WHOOP paginates** with the query parameter `nextToken` and answers with
  `{ records, next_token }`.
- **Wahoo sends numbers as strings** and does not always include
  `workout_summary` in the list response; it is then loaded from
  `/v1/workouts/:id/workout_summary`.
- **Wahoo does not return heart rate zone durations.** That is why
  `capabilities.hrZones` is `false` and `hrZoneSec` stays `null`.
- **Both providers expect the client credentials as form fields**, not as an
  HTTP Basic header.
