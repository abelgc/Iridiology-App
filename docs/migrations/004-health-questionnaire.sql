-- Migration 004: add health_questionnaire JSONB to client_analyses
-- Date: 2026-04-20

ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS health_questionnaire JSONB;
