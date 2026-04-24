-- Flag reports where language detection failed after retry
ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS language_flag BOOLEAN NOT NULL DEFAULT FALSE;
