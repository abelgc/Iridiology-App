-- Migration 013: add full_name to client_analyses (collected by the intake form since day
-- one via clientIntakeSchema, but never persisted — the client report can't greet the
-- client by name without it)
-- Date: 2026-07-11

ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS full_name TEXT;
