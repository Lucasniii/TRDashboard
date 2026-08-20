-- Multi-user WHOOP OAuth storage. These tables are server-only: dashboard
-- sessions and provider tokens must never be reachable with a browser key.

create table public.trdashboard_users (
  id uuid primary key default gen_random_uuid(),
  whoop_user_id text not null unique,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trdashboard_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.trdashboard_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index trdashboard_sessions_token_hash_idx on public.trdashboard_sessions (token_hash);
create index trdashboard_sessions_user_id_idx on public.trdashboard_sessions (user_id);

create table public.trdashboard_provider_connections (
  user_id uuid not null references public.trdashboard_users (id) on delete cascade,
  provider text not null check (provider in ('whoop', 'wahoo')),
  encrypted_tokens text not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  primary key (user_id, provider)
);

create table public.trdashboard_user_documents (
  user_id uuid not null references public.trdashboard_users (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9-]+$'),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

create index trdashboard_user_documents_user_name_idx
  on public.trdashboard_user_documents (user_id, name);

alter table public.trdashboard_users enable row level security;
alter table public.trdashboard_sessions enable row level security;
alter table public.trdashboard_provider_connections enable row level security;
alter table public.trdashboard_user_documents enable row level security;

revoke all on table public.trdashboard_users from anon, authenticated;
revoke all on table public.trdashboard_sessions from anon, authenticated;
revoke all on table public.trdashboard_provider_connections from anon, authenticated;
revoke all on table public.trdashboard_user_documents from anon, authenticated;

grant select, insert, update, delete on table public.trdashboard_users to service_role;
grant select, insert, update, delete on table public.trdashboard_sessions to service_role;
grant select, insert, update, delete on table public.trdashboard_provider_connections to service_role;
grant select, insert, update, delete on table public.trdashboard_user_documents to service_role;
