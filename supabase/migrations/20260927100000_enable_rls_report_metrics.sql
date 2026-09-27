-- Only the server writes here, with the service-role key, which bypasses RLS.
alter table public.report_metrics enable row level security;
