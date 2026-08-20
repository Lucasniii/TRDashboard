-- A dashboard account may be created through either supported OAuth provider.
-- Unique nullable provider IDs retain direct PostgREST upserts for both flows.

alter table public.trdashboard_users
  alter column whoop_user_id drop not null,
  add column wahoo_user_id text unique;
