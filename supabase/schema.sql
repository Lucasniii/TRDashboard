-- strwo — Postgres / Supabase schema
--
-- Phase 1 runs entirely on the in-memory mock repository; this file is the
-- target the repository interface is designed against. It is written so it can
-- be applied to a fresh Supabase project without further edits.
--
-- Two invariants drive the design:
--   1. Every imported row keeps its provenance (source_provider, source_record_id,
--      synced_at) so a record can always be traced back and re-synced.
--   2. The same real-world session imported from two providers must not become
--      two rows. That is enforced by the natural key below plus the
--      deduplication that happens in the provider mapping layer before insert.

create extension if not exists "pgcrypto";

-- ── enums ────────────────────────────────────────────────────────────────────

create type provider_id as enum (
  'whoop', 'wahoo', 'strava', 'garmin', 'apple_health', 'wub', 'csv', 'manual', 'mock'
);

create type activity_type as enum (
  'ride', 'indoor_ride', 'run', 'hike', 'strength', 'other'
);

create type zone_kind as enum ('heart_rate', 'power');

create type training_load_kind as enum ('whoop_strain', 'tss', 'trimp');

create type sync_job_status as enum ('pending', 'running', 'succeeded', 'failed');

-- ── users ────────────────────────────────────────────────────────────────────

-- Mirrors auth.users; the app never reads auth.users directly.
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default 'Athlet',
  locale       text        not null default 'de-AT',
  timezone     text        not null default 'Europe/Vienna',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── connected providers ──────────────────────────────────────────────────────

create table data_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid        not null references profiles (id) on delete cascade,
  provider      provider_id not null,
  -- OAuth material. Never exposed to the client: RLS denies select on this table
  -- to the anon/authenticated roles; only the service role touches it.
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, provider)
);

-- ── activities ───────────────────────────────────────────────────────────────

create table activities (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references profiles (id) on delete cascade,

  source_provider     provider_id   not null,
  source_record_id    text          not null,
  synced_at           timestamptz   not null default now(),

  type                activity_type not null default 'other',
  name                text          not null,
  started_at          timestamptz   not null,
  timezone            text,

  duration_sec        integer       not null check (duration_sec >= 0),
  elapsed_sec         integer       check (elapsed_sec >= 0),
  distance_m          double precision check (distance_m >= 0),
  elevation_gain_m    double precision check (elevation_gain_m >= 0),
  avg_speed_mps       double precision check (avg_speed_mps >= 0),

  avg_heart_rate      smallint      check (avg_heart_rate between 20 and 250),
  max_heart_rate      smallint      check (max_heart_rate between 20 and 250),
  avg_power           smallint      check (avg_power >= 0),
  normalized_power    smallint      check (normalized_power >= 0),
  calories            integer       check (calories >= 0),

  training_load       double precision,
  training_load_kind  training_load_kind,

  -- Zone 1..5 seconds. Length is enforced so the 5-tuple in the TS model holds.
  hr_zone_sec         integer[]     check (hr_zone_sec is null or array_length(hr_zone_sec, 1) = 5),
  power_zone_sec      integer[]     check (power_zone_sec is null or array_length(power_zone_sec, 1) = 5),

  has_gps             boolean       not null default false,
  created_at          timestamptz   not null default now(),

  -- Re-syncing the same record updates it instead of duplicating it.
  unique (user_id, source_provider, source_record_id)
);

create index activities_user_started_idx on activities (user_id, started_at desc);
create index activities_user_type_idx on activities (user_id, type, started_at desc);

-- Cross-provider duplicates (the same ride from Wahoo and WHOOP) cannot be caught
-- by a unique constraint because the ids differ. This index makes the
-- "same user, start within 20 minutes" lookup that the mapping layer performs
-- before insert cheap.
create index activities_user_start_window_idx on activities (user_id, started_at);

-- Sample streams live apart from the summary row: they are large and rarely read.
create table activity_streams (
  activity_id  uuid primary key references activities (id) on delete cascade,
  time_sec     integer[] not null,
  heart_rate   smallint[],
  power        smallint[],
  speed_mps    real[],
  altitude_m   real[],
  cadence      smallint[],
  -- [[lat, lng], …] stored as a flat pair array; PostGIS is deliberately avoided
  -- until routes need real spatial queries.
  lat_lng      double precision[][],
  created_at   timestamptz not null default now()
);

-- ── health ───────────────────────────────────────────────────────────────────

-- One row per user per day. Any column may be null: no provider supplies all of them.
create table daily_health_metrics (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references profiles (id) on delete cascade,
  date                date        not null,

  source_provider     provider_id not null,
  source_record_id    text        not null,
  synced_at           timestamptz not null default now(),

  hrv_ms              double precision check (hrv_ms > 0),
  resting_heart_rate  smallint    check (resting_heart_rate between 20 and 150),
  respiratory_rate    double precision check (respiratory_rate > 0),
  skin_temperature_c  double precision,
  blood_oxygen_pct    double precision check (blood_oxygen_pct between 50 and 100),
  weight_kg           double precision check (weight_kg > 0),

  unique (user_id, date, source_provider)
);

create index daily_health_user_date_idx on daily_health_metrics (user_id, date desc);

create table sleep_sessions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references profiles (id) on delete cascade,
  date               date        not null,

  source_provider    provider_id not null,
  source_record_id   text        not null,
  synced_at          timestamptz not null default now(),

  started_at         timestamptz not null,
  ended_at           timestamptz not null,
  duration_sec       integer     not null check (duration_sec >= 0),
  time_in_bed_sec    integer     check (time_in_bed_sec >= 0),
  sleep_score        smallint    check (sleep_score between 0 and 100),

  rem_sec            integer     check (rem_sec >= 0),
  deep_sec           integer     check (deep_sec >= 0),
  light_sec          integer     check (light_sec >= 0),
  awake_sec          integer     check (awake_sec >= 0),
  respiratory_rate   double precision,

  unique (user_id, source_provider, source_record_id)
);

create index sleep_user_date_idx on sleep_sessions (user_id, date desc);

-- Recovery as the PROVIDER reported it. Values we derive ourselves are computed
-- at read time and never written here, so the two can never be confused.
create table recovery_metrics (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references profiles (id) on delete cascade,
  date               date        not null,

  source_provider    provider_id not null,
  source_record_id   text        not null,
  synced_at          timestamptz not null default now(),

  provider_score     smallint    check (provider_score between 0 and 100),
  day_strain         double precision,
  hrv_ms             double precision,
  resting_heart_rate smallint,

  unique (user_id, date, source_provider)
);

create index recovery_user_date_idx on recovery_metrics (user_id, date desc);

-- ── configuration ────────────────────────────────────────────────────────────

create table training_zones (
  id              uuid      primary key default gen_random_uuid(),
  user_id         uuid      not null references profiles (id) on delete cascade,
  kind            zone_kind not null,
  -- Basis the boundaries were derived from; exactly one is set per kind.
  max_heart_rate  smallint,
  ftp_watts       smallint,
  -- [{zone, label, min, max}] — kept as jsonb so a label change is not a migration.
  boundaries      jsonb     not null,
  updated_at      timestamptz not null default now(),
  unique (user_id, kind)
);

create table weekly_goals (
  user_id          uuid    primary key references profiles (id) on delete cascade,
  duration_sec     integer check (duration_sec > 0),
  distance_m       double precision check (distance_m > 0),
  elevation_gain_m double precision check (elevation_gain_m > 0),
  updated_at       timestamptz not null default now()
);

create table sync_jobs (
  id            uuid            primary key default gen_random_uuid(),
  user_id       uuid            not null references profiles (id) on delete cascade,
  provider      provider_id     not null,
  status        sync_job_status not null default 'pending',
  started_at    timestamptz     not null default now(),
  finished_at   timestamptz,
  record_counts jsonb           not null default '{}'::jsonb,
  error         text
);

create index sync_jobs_user_started_idx on sync_jobs (user_id, started_at desc);

-- ── row level security ───────────────────────────────────────────────────────
--
-- Single-user today, multi-user by construction: every table is scoped by
-- user_id and every policy is "the row is mine".

alter table profiles             enable row level security;
alter table data_sources         enable row level security;
alter table activities           enable row level security;
alter table activity_streams     enable row level security;
alter table daily_health_metrics enable row level security;
alter table sleep_sessions       enable row level security;
alter table recovery_metrics     enable row level security;
alter table training_zones       enable row level security;
alter table weekly_goals         enable row level security;
alter table sync_jobs            enable row level security;

create policy "profiles are self" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array[
    'activities', 'daily_health_metrics', 'sleep_sessions', 'recovery_metrics',
    'training_zones', 'weekly_goals', 'sync_jobs'
  ] loop
    execute format(
      'create policy %I on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;

-- Streams inherit ownership from their activity.
create policy activity_streams_owner on activity_streams
  for all
  using (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.user_id = auth.uid()));

-- data_sources holds OAuth tokens. No policy is created on purpose: with RLS
-- enabled and no permissive policy, anon and authenticated can read nothing.
-- Only the service role (which bypasses RLS) may touch this table, and it is
-- only ever reached from server-side sync code.
