-- Migration 015: rename payment_tier identifiers to reflect current pricing
-- basic_12 / premium_19_90 were named after prices from before a price increase.
-- New names reflect the real current prices: EUR 19.90 and EUR 29.90.

-- 1. Drop the old CHECK constraint FIRST — it rejects the new tier names,
--    so updating rows to them while it's still active fails immediately.
--    (Constraint name follows Postgres's default naming: <table>_<column>_check;
--    verify against the live schema before applying if migration 003's inline
--    CHECK was ever given an explicit name.)
ALTER TABLE client_analyses DROP CONSTRAINT IF EXISTS client_analyses_payment_tier_check;

-- 2. Now safe to update existing rows to the new tier names.
UPDATE client_analyses SET payment_tier = 'basic_1990'  WHERE payment_tier = 'basic_12';
UPDATE client_analyses SET payment_tier = 'premium_2990' WHERE payment_tier = 'premium_19_90';

-- 3. Add the new CHECK constraint.
ALTER TABLE client_analyses
  ADD CONSTRAINT client_analyses_payment_tier_check
  CHECK (payment_tier IN ('basic_1990', 'premium_2990'));
