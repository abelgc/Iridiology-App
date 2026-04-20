-- Migration 003: client_analyses table for stateless self-service flow
-- Date: 2026-04-19

-- Allow reports to exist without a session (client analyses skip the sessions table)
ALTER TABLE reports ALTER COLUMN session_id DROP NOT NULL;

-- Main table for client self-service analyses
CREATE TABLE IF NOT EXISTS client_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Payment
  payment_tier VARCHAR(20) NOT NULL CHECK (payment_tier IN ('basic_12', 'premium_19_90')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMP WITH TIME ZONE,
  is_mock_payment BOOLEAN NOT NULL DEFAULT FALSE,

  language VARCHAR(2) NOT NULL DEFAULT 'es' CHECK (language IN ('en', 'es')),

  -- PII (cleared after pii_expires_at by nightly cron)
  email TEXT,
  main_complaint TEXT,
  symptom_duration TEXT,
  current_medications TEXT,
  date_of_birth DATE,
  country_of_birth TEXT,
  city_of_birth TEXT,
  time_of_day VARCHAR(10) CHECK (time_of_day IN ('morning', 'evening')),

  -- Report (permanent)
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  report_download_token TEXT UNIQUE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'intake_pending'
    CHECK (status IN ('intake_pending', 'paid', 'analyzing', 'completed', 'failed')),
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  report_delivered_at TIMESTAMP WITH TIME ZONE,
  pii_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_client_analyses_token ON client_analyses(report_download_token);
CREATE INDEX IF NOT EXISTS idx_client_analyses_status ON client_analyses(status);
CREATE INDEX IF NOT EXISTS idx_client_analyses_pii_expires
  ON client_analyses(pii_expires_at)
  WHERE email IS NOT NULL;

-- RLS: deny direct client/anon access. All access goes through API routes using service role.
ALTER TABLE client_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON client_analyses;
CREATE POLICY "Service role only"
  ON client_analyses
  FOR ALL
  USING (false);
