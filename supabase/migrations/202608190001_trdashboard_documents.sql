-- Private document storage used by the deployed single-user dashboard.
-- It is deliberately separate from the existing Formline tables.

create table if not exists public.trdashboard_documents (
  name text primary key check (name ~ '^[a-z0-9-]+$'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.trdashboard_documents enable row level security;

revoke all on table public.trdashboard_documents from anon, authenticated;
grant select, insert, update, delete on table public.trdashboard_documents to service_role;
