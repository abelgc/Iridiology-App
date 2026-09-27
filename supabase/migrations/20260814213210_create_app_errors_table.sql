create table app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('server','edge','client')),
  route text,
  message text not null,
  stack text,
  context jsonb,
  severity text not null default 'error'
);

alter table app_errors enable row level security;

-- Production's default privileges grant these on every new table; the local CLI stack no longer does.
grant all on table app_errors to anon, authenticated, service_role;
