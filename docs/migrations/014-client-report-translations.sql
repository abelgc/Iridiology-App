-- Migration 014: cache AI-translated client-facing report content so translating a report
-- into a given language is a one-time AI cost, not a fresh AI call every time a client (or
-- anyone with the link) reloads the report page or switches the language toggle.
-- Date: 2026-07-20

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS client_report_translations JSONB NOT NULL DEFAULT '{}'::jsonb;
