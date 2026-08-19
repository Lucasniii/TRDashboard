# strwo

A personal cycling, training, recovery and health dashboard. The interface is
German (`de-AT`, metric); the code, data model and documentation are English.

The dashboard is built to answer six questions within a few seconds of opening:
how much was trained this week, how many kilometres, how many vertical metres,
how the intensity is distributed, how HRV is developing, and how well recovered
the athlete currently is.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Phase 1 ships with a deterministic 16-week mock dataset, so the app is fully
usable before any provider is connected.

## Architecture

```
src/
  app/                    routes (App Router, server components by default)
    page.tsx              Übersicht
    aktivitaeten/         Aktivitäten + [id] detail
    training/             Training
    gesundheit/           Gesundheit
    trends/               Trends
    kalender/             Kalender + [tag] day detail
    einstellungen/        Einstellungen (+ server actions)
  components/
    ui/                   primitives: Card, StatTile, DeltaBadge, ProgressBar, …
    charts/               Recharts wrappers, one visual system
    nav/                  app shell, navigation, theme toggle
    <feature>/            page-local components
  lib/
    domain/types.ts       the internal data model — the contract
    data/repository.ts    HealthDataRepository interface
    data/index.ts         which repository the app uses
    mock/                 deterministic mock dataset + MockRepository
    analytics/            pure computation: weekly, zones, health, trends
    providers/            external platform adapters (WHOOP, Wahoo, …)
    format.ts             every de-AT formatter
    date.ts               day keys, Monday weeks, half-open ranges
supabase/schema.sql       the Postgres target schema with RLS
```

The layers only ever point downwards:

```
pages → analytics → repository interface → (mock | postgres) ← provider adapters
```

A page never talks to a provider, and the analytics layer never performs I/O.
That is what makes the mock-to-database swap a one-file change in
`src/lib/data/index.ts`.

### Data model

Defined once in `src/lib/domain/types.ts` and mirrored by `supabase/schema.sql`:
`Activity`, `ActivityStreams`, `DailyHealthMetrics`, `SleepSession`,
`RecoveryMetric`, `TrainingZoneSet`, `WeeklyGoals`, `UserSettings`,
`DataSourceStatus`, `SyncJob`.

Two rules run through all of it:

- **Provenance is kept.** Every imported record carries
  `source { provider, recordId, syncedAt }`, and the database enforces
  `unique (user_id, source_provider, source_record_id)` so a re-sync updates
  rather than duplicates.
- **Missing is `null`, never `0`.** No metric is ever substituted or invented to
  fill a chart. The UI renders `keine Daten` or an empty state instead. A zero
  week is a real zero; a ride without a power meter has `avgPower: null`.

### Providers

Every platform implements `ProviderAdapter` (`src/lib/providers/types.ts`):
its own OAuth dialect and response shapes go in the adapter, and everything
above it sees only the internal model. Each adapter declares
`ProviderCapabilities`, which is what lets the UI degrade honestly — Wahoo
supplies distance and power but no heart-rate zones, WHOOP supplies zones, HRV
and sleep but no GPS.

Adding a provider: implement the interface, declare capabilities, register it in
`src/lib/providers/registry.ts`. Nothing else changes.

The same session imported from two platforms is merged in
`src/lib/providers/mapping.ts` (start within 20 minutes and duration within 15
minutes), preferring Wahoo's distance and power and WHOOP's zone durations and
load.

### Connecting WHOOP and Wahoo

Register an app at [developer.whoop.com](https://developer.whoop.com) and at
[developers.wahooligan.com](https://developers.wahooligan.com/applications/new),
then put the credentials in `.env.local` and restart the server:

```
WHOOP_CLIENT_ID=…
WHOOP_CLIENT_SECRET=…
WAHOO_CLIENT_ID=…
WAHOO_CLIENT_SECRET=…
```

The redirect URIs to register are `http://localhost:3000/api/auth/whoop/callback`
and `http://localhost:3000/api/auth/wahoo/callback` — they must match exactly.
WHOOP additionally needs the `offline` scope, or it issues no refresh token; the
adapter already requests it.

Then *Einstellungen → Datenquellen → Verbinden*, and *Jetzt synchronisieren*
pulls the last 120 days. Tokens and records land in `data/` (gitignored, written
with mode 0600); disconnecting deletes both the tokens and that provider's rows.

Storage lives behind the same `HealthDataRepository`, so `data/index.ts` still
decides everything: `STRWO_DATA_SOURCE` is `local` (default), `mock` for the
generated demo history, and `supabase` once that repository exists.

### Derived vs. provider metrics

A recovery score that came from a platform is shown as that platform's number
and labelled with its source. The readiness value computed in
`analytics/health.ts` is always marked `isDerived` and labelled `berechnet` in
the interface, and it returns `null` unless HRV and resting heart rate are both
present. Acute load, chronic load, fitness and fatigue are deliberately **not**
implemented: the current sources do not provide continuous daily load, and
inventing them would violate the rule above. `components/training/load-panel.tsx`
holds the seam where they belong.

None of these numbers are a medical assessment, and the interface says so.

### Charts

One visual system, defined by tokens in `src/app/globals.css` and wrapped in
`src/components/charts/`. Components reference roles (`var(--series-1)`,
`bg-zone-3`), never raw hex, so light and dark swap in one place.

Two rules worth knowing before adding a chart:

- **No dual-axis charts.** Two measures of different scale become two stacked
  panels sharing one x-axis and one synchronised crosshair
  (`charts/synced-panels.tsx`). That is how the Trends page compares HRV against
  training load.
- **Training zones use an ordinal single-hue ramp** (`--zone-1` … `--zone-5`),
  not five categorical hues. The palette and the ramp were checked with the
  data-viz validator for colour-vision separation and surface contrast in both
  themes.

## Status

**Phase 1 — done.** Project structure, navigation, German UI, responsive layout,
dark mode, the seven sections, mock data, weekly KPIs, goals, training-volume
charts, zone distribution, HRV and resting-heart-rate trends, sleep, recovery,
activity feed and activity detail.

**Phase 2.** Deeper activity analytics, richer calendar interactions, saved
custom periods.

**Phase 3 — done.** WHOOP and Wahoo connect over OAuth, tokens are stored and
refreshed locally, and a sync writes normalized records that the pages read
through `LocalRepository`. Webhooks and per-second activity streams are not
implemented: Wahoo delivers streams only inside the FIT file, which the adapter
does not download yet, so activity detail charts stay empty for synced rides
until it does.

**Phase 4.** Advanced analytics and insights on top of continuous data.
