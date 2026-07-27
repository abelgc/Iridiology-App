-- Production schema for project oxaiiawgklmltonuglqw, reconstructed on 2026-07-27.
--
-- HOW THIS WAS OBTAINED, and why it is not `supabase db pull`:
-- `supabase link` requires a personal access token (`supabase login` / SUPABASE_ACCESS_TOKEN)
-- and `db pull` additionally requires the database password. Neither is available in this
-- environment, so the CLI could not reach the remote project. Instead every object below was
-- read directly out of the LIVE production catalog over the read-only Supabase MCP connection
-- (pg_catalog / information_schema SELECTs only, no writes):
--
--   information_schema.columns          -> column names, types, lengths, nullability, defaults
--   pg_constraint + pg_get_constraintdef-> PK / FK / UNIQUE / CHECK, verbatim
--   pg_indexes                          -> every index definition, verbatim
--   pg_policies + pg_class.relrowsecurity-> RLS state and policy bodies
--   pg_extension                        -> installed extensions and their schemas
--   pg_proc / pg_trigger                -> confirmed: NO functions and NO triggers in `public`
--   cron.job                            -> the pg_cron PII sweeper (see bottom of this file)
--   information_schema.role_table_grants-> role grants
--
-- Deliberately NOT replayed from docs/migrations/*.sql, which do not reproduce production:
--   * email_send_log.error_message exists live and in no migration file  -> present below
--   * docs/schema.sql declares reports.session_id NOT NULL; live is NULLABLE -> nullable below
--   * the pg_cron `clear-client-pii` job exists live and in no file       -> present below
--
-- KNOWN DIFFERENCES FROM PRODUCTION (all deliberate, none affect the tested code paths):
--   * Server version: production reports PostgreSQL 17.6; the local stack pins major 17.
--   * Extensions pg_stat_statements and supabase_vault are installed in production but are
--     provided by the local Supabase image itself, so they are not recreated here.
--   * Production role grants are the full Supabase default set (DELETE, INSERT, REFERENCES,
--     SELECT, TRIGGER, TRUNCATE, UPDATE for anon/authenticated/service_role/postgres) and are
--     reproduced verbatim, because recent CLI versions no longer auto-expose new tables.
--   * Row data is obviously not copied. No production row was ever read beyond the catalog.

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id uuid not null default extensions.uuid_generate_v4(),
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  full_name varchar(255) not null,
  date_of_birth date null,
  gender varchar(50) null,
  email varchar(255) null,
  phone varchar(20) null,
  general_history text null,
  notes text null,
  country_of_birth text null,
  city_of_birth text null,
  time_of_day varchar(10) null,
  constraint patients_pkey primary key (id)
);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id uuid not null default extensions.uuid_generate_v4(),
  patient_id uuid not null,
  created_at timestamptz null default now(),
  session_date date not null,
  symptoms text null,
  practitioner_notes text null,
  analysis_mode varchar(50) null default 'standard'::character varying,
  practitioner_interpretation text null,
  status varchar(50) null default 'pending'::character varying,
  error_message text null,
  constraint sessions_pkey primary key (id),
  constraint sessions_patient_id_fkey foreign key (patient_id)
    references public.patients (id) on delete cascade,
  constraint sessions_analysis_mode_check check (
    (analysis_mode)::text = any ((array['standard'::varchar, 'comparison'::varchar, 'technical_review'::varchar])::text[])
  ),
  constraint sessions_status_check check (
    (status)::text = any ((array['pending'::varchar, 'analyzing'::varchar, 'completed'::varchar, 'error'::varchar])::text[])
  )
);

create index if not exists idx_sessions_created_at on public.sessions using btree (created_at);
create index if not exists idx_sessions_patient_id on public.sessions using btree (patient_id);

-- ---------------------------------------------------------------------------
-- reports
--
-- session_id is NULLABLE in production. docs/schema.sql claims NOT NULL, which is wrong:
-- the client pipeline inserts a report with no session at all (see the `reports` insert in
-- src/app/api/client/upload/route.ts). Replaying docs/schema.sql would make every client
-- upload integration test fail for a reason production does not have.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid not null default extensions.uuid_generate_v4(),
  session_id uuid null,
  created_at timestamptz null default now(),
  updated_at timestamptz null default now(),
  report_content jsonb not null,
  report_version integer null default 1,
  is_edited boolean null default false,
  client_report_content jsonb null,
  client_report_translations jsonb not null default '{}'::jsonb,
  constraint reports_pkey primary key (id),
  constraint reports_session_id_fkey foreign key (session_id)
    references public.sessions (id) on delete cascade
);

create index if not exists idx_reports_created_at on public.reports using btree (created_at);
create index if not exists idx_reports_session_id on public.reports using btree (session_id);

-- ---------------------------------------------------------------------------
-- report_corrections
-- ---------------------------------------------------------------------------
create table if not exists public.report_corrections (
  id uuid not null default extensions.uuid_generate_v4(),
  report_id uuid not null,
  patient_id uuid not null,
  section_key varchar(255) not null,
  original_content text not null,
  corrected_content text not null,
  correction_notes text null,
  created_at timestamptz null default now(),
  constraint report_corrections_pkey primary key (id),
  constraint report_corrections_report_id_fkey foreign key (report_id)
    references public.reports (id) on delete cascade,
  constraint report_corrections_patient_id_fkey foreign key (patient_id)
    references public.patients (id) on delete cascade
);

create index if not exists idx_corrections_patient_id on public.report_corrections using btree (patient_id);
create index if not exists idx_corrections_report_id on public.report_corrections using btree (report_id);

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key text not null,
  value text null,
  updated_at timestamptz null default now(),
  constraint settings_pkey primary key (key)
);

-- ---------------------------------------------------------------------------
-- client_analyses
--
-- The status CHECK has exactly six values. The upload route's status matrix test asserts one
-- case per value, so if production ever grows a seventh the local schema drifts and the test
-- suite goes quiet about it — re-pull this file when that happens.
-- ---------------------------------------------------------------------------
create table if not exists public.client_analyses (
  id uuid not null default extensions.uuid_generate_v4(),
  payment_tier varchar(20) not null,
  amount numeric(10, 2) not null,
  currency varchar(3) not null default 'EUR'::character varying,
  stripe_payment_intent_id text null,
  paid_at timestamptz null,
  is_mock_payment boolean not null default false,
  language varchar(2) not null default 'es'::character varying,
  email text null,
  main_complaint text null,
  symptom_duration text null,
  current_medications text null,
  date_of_birth date null,
  country_of_birth text null,
  city_of_birth text null,
  time_of_day varchar(10) null,
  report_id uuid null,
  report_download_token text not null,
  status varchar(20) not null default 'intake_pending'::character varying,
  failure_reason text null,
  created_at timestamptz not null default now(),
  report_delivered_at timestamptz null,
  pii_expires_at timestamptz not null default (now() + '30 days'::interval),
  health_questionnaire jsonb null,
  analyzing_started_at timestamptz null,
  stage2_started_at timestamptz null,
  stage2_retry_count integer not null default 0,
  full_name text null,
  constraint client_analyses_pkey primary key (id),
  constraint client_analyses_report_download_token_key unique (report_download_token),
  constraint client_analyses_stripe_payment_intent_id_key unique (stripe_payment_intent_id),
  constraint client_analyses_report_id_fkey foreign key (report_id)
    references public.reports (id) on delete set null,
  constraint client_analyses_payment_tier_check check (
    (payment_tier)::text = any ((array['basic_1990'::varchar, 'premium_2990'::varchar])::text[])
  ),
  constraint client_analyses_language_check check (
    (language)::text = any ((array['en'::varchar, 'es'::varchar, 'de'::varchar])::text[])
  ),
  constraint client_analyses_time_of_day_check check (
    (time_of_day)::text = any ((array['morning'::varchar, 'evening'::varchar])::text[])
  ),
  constraint client_analyses_status_check check (
    (status)::text = any ((array[
      'intake_pending'::varchar,
      'paid'::varchar,
      'analyzing'::varchar,
      'stage2_processing'::varchar,
      'completed'::varchar,
      'failed'::varchar
    ])::text[])
  )
);

create index if not exists idx_client_analyses_status on public.client_analyses using btree (status);
create index if not exists idx_client_analyses_token on public.client_analyses using btree (report_download_token);
create index if not exists idx_client_analyses_pii_expires
  on public.client_analyses using btree (pii_expires_at) where (email is not null);

-- ---------------------------------------------------------------------------
-- email_send_log
--
-- UNIQUE(analysis_id) is the entire concurrency guard behind sendReportEmail: it is what makes
-- the loser of two concurrent sends fail its INSERT and fall into the 'send_in_progress' path.
-- error_message exists in production and in NO migration file under docs/migrations/.
-- ---------------------------------------------------------------------------
create table if not exists public.email_send_log (
  id uuid not null default gen_random_uuid(),
  analysis_id uuid not null,
  recipient_email text not null,
  payment_tier text not null,
  status text not null,
  sent_at timestamptz not null default now(),
  error_message text null,
  constraint email_send_log_pkey primary key (id),
  constraint email_send_log_analysis_id_key unique (analysis_id),
  constraint email_send_log_analysis_id_fkey foreign key (analysis_id)
    references public.client_analyses (id),
  constraint email_send_log_status_check check (
    status = any (array['pending'::text, 'sent'::text, 'failed'::text])
  )
);

-- ---------------------------------------------------------------------------
-- Row level security — verbatim from pg_policies. service_role bypasses RLS, which is what
-- createAdminClient() uses, so these do not gate the tests; they are here for fidelity.
-- ---------------------------------------------------------------------------
alter table public.patients enable row level security;
alter table public.sessions enable row level security;
alter table public.reports enable row level security;
alter table public.report_corrections enable row level security;
alter table public.settings enable row level security;
alter table public.client_analyses enable row level security;
alter table public.email_send_log enable row level security;

create policy "Allow authenticated" on public.patients for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage patients" on public.patients for all using (auth.role() = 'authenticated'::text);
create policy "authenticated_all" on public.patients for all to authenticated using (true) with check (true);

create policy "Allow authenticated" on public.sessions for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage sessions" on public.sessions for all using (auth.role() = 'authenticated'::text);
create policy "authenticated_all" on public.sessions for all to authenticated using (true) with check (true);

create policy "Allow authenticated" on public.reports for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage reports" on public.reports for all using (auth.role() = 'authenticated'::text);
create policy "authenticated_all" on public.reports for all to authenticated using (true) with check (true);

create policy "Allow authenticated" on public.report_corrections for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage corrections" on public.report_corrections for all using (auth.role() = 'authenticated'::text);
create policy "authenticated_all" on public.report_corrections for all to authenticated using (true) with check (true);

create policy "Authenticated users can manage settings" on public.settings for all using (auth.role() = 'authenticated'::text);

create policy "Service role only" on public.client_analyses for all using (false);
create policy "No direct access" on public.email_send_log for all using (false);

-- ---------------------------------------------------------------------------
-- Grants — reproduced from information_schema.role_table_grants on production.
-- Recent Supabase CLI versions do NOT auto-expose newly created tables to the Data API roles,
-- so without these the service_role key cannot see a single row locally.
-- ---------------------------------------------------------------------------
grant all on all tables in schema public to anon, authenticated, service_role, postgres;
grant all on all sequences in schema public to anon, authenticated, service_role, postgres;
grant all on all functions in schema public to anon, authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- pg_cron: the PII sweeper.
--
-- This job exists in production (cron.job id 1, name 'clear-client-pii') and in NO file in
-- this repository. It nulls every PII column on any client_analyses row past pii_expires_at.
-- Reproduced verbatim so the local schema is not quietly missing a writer to the same table
-- the rescue sweep is racing on. It is scheduled for 03:00 and pii_expires_at defaults to
-- now() + 30 days, so it never fires during a test run.
--
-- Wrapped: if the local image ever ships without pg_cron the whole migration would otherwise
-- fail and take the entire suite down over a job that no test depends on.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'clear-client-pii',
    '0 3 * * *',
    $job$
      UPDATE client_analyses
      SET email = NULL,
          main_complaint = NULL,
          symptom_duration = NULL,
          current_medications = NULL,
          date_of_birth = NULL,
          country_of_birth = NULL,
          city_of_birth = NULL,
          time_of_day = NULL
      WHERE pii_expires_at < NOW()
        AND email IS NOT NULL;
    $job$
  );
exception when others then
  raise notice 'pg_cron unavailable locally, skipping clear-client-pii job: %', sqlerrm;
end
$$;
