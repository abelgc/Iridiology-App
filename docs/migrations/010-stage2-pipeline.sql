-- Migration 010: split the client-analysis pipeline into two chained serverless
-- invocations (dual-provider analysis+synthesis, then Jyotish+client-rewrite+PDF+email)
-- so neither stage needs to fit inside one function's duration ceiling. The expensive
-- Stage 1 work is persisted before Stage 2 starts, so a Stage 2 failure can be retried
-- without re-running Stage 1.

ALTER TABLE client_analyses DROP CONSTRAINT IF EXISTS client_analyses_status_check;
ALTER TABLE client_analyses ADD CONSTRAINT client_analyses_status_check
  CHECK (status IN ('intake_pending', 'paid', 'analyzing', 'stage2_processing', 'completed', 'failed'));

ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS stage2_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stage2_retry_count INT NOT NULL DEFAULT 0;
