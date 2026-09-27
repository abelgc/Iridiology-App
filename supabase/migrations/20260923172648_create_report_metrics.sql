create table report_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  route text not null check (route in ('analyze', 'compare')),
  outcome text not null check (outcome in ('completed', 'failed')),
  total_ms integer not null,
  claude_leg_ms integer,
  claude_leg_retried boolean not null default false,
  openai_leg_ms integer,
  openai_leg_retried boolean not null default false,
  synthesis_ms integer,
  synthesis_retried boolean not null default false,
  created_at timestamptz not null default now()
);
create index report_metrics_session_id_idx on report_metrics(session_id);

-- Production's default privileges grant these on every new table; the local CLI stack no longer does.
grant all on table report_metrics to anon, authenticated, service_role;
