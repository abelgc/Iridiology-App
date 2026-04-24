-- Client-facing rewritten report (plain language, no clinical jargon)
-- Falls back to report_content if NULL
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS client_report_content JSONB;
