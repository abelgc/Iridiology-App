-- Track email sends to prevent duplicates
CREATE TABLE IF NOT EXISTS email_send_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES client_analyses(id),
  recipient_email TEXT NOT NULL,
  payment_tier  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id)
);

ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access" ON email_send_log FOR ALL USING (false);
