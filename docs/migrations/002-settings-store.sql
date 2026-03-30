-- Migration 002: Settings Store
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'settings'
    AND policyname = 'Authenticated users can manage settings'
  ) THEN
    CREATE POLICY "Authenticated users can manage settings"
      ON settings FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

INSERT INTO settings (key, value) VALUES
  ('active_provider',   'openai'),
  ('anthropic_api_key', ''),
  ('openai_api_key',    ''),
  ('anthropic_model',   'claude-sonnet-4-6'),
  ('openai_model',      'gpt-4.5')
ON CONFLICT (key) DO NOTHING;
