-- Migration 009: track when an analysis attempt actually began, so stuck 'analyzing'
-- rows (left behind by a hard Vercel process kill at the maxDuration=300s wall, before
-- the background task's own catch-block write can run) can be detected purely from
-- elapsed wall-clock time on read. created_at is intake time (pre-payment, pre-upload)
-- and is NOT usable for this — a client can delay arbitrarily between intake and
-- photo upload.

ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS analyzing_started_at TIMESTAMP WITH TIME ZONE;
