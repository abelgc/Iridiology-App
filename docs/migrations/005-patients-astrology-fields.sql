-- Migration 005: add astrology/birth fields to patients table
-- Date: 2026-04-22

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS country_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS city_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS time_of_day TIME;
