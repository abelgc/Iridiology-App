-- Migration 012: allow German ('de') as a valid client_analyses.language value
--
-- 'de' was added as a supported locale (src/lib/i18n.ts, commit b972d98) but this
-- table's CHECK constraint (migration 003) was never updated, so German intake
-- submissions fail at insert time even after the Zod schema is fixed.

ALTER TABLE client_analyses DROP CONSTRAINT IF EXISTS client_analyses_language_check;
ALTER TABLE client_analyses ADD CONSTRAINT client_analyses_language_check
  CHECK (language IN ('en', 'es', 'de'));
