-- Iridology App Database Schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create auth schema if using Supabase auth
-- (This is typically handled by Supabase automatically)

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(20),
  general_history TEXT,
  notes TEXT
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_date DATE NOT NULL,
  symptoms TEXT,
  practitioner_notes TEXT,
  analysis_mode VARCHAR(50) DEFAULT 'standard' CHECK (analysis_mode IN ('standard', 'comparison', 'technical_review')),
  practitioner_interpretation TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'completed', 'error'))
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  report_content JSONB NOT NULL,
  report_version INTEGER DEFAULT 1,
  is_edited BOOLEAN DEFAULT FALSE
);

-- Report corrections table
CREATE TABLE IF NOT EXISTS report_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  section_key VARCHAR(255) NOT NULL,
  original_content TEXT NOT NULL,
  corrected_content TEXT NOT NULL,
  correction_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_corrections_report_id ON report_corrections(report_id);
CREATE INDEX IF NOT EXISTS idx_corrections_patient_id ON report_corrections(patient_id);

-- Row Level Security Policies (for Supabase)
-- Note: Adjust these based on your authentication strategy

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_corrections ENABLE ROW LEVEL SECURITY;

-- RLS policies: any authenticated user can perform all operations
-- (single-practitioner app — one logged-in user manages everything)
CREATE POLICY "Authenticated users can manage patients"
  ON patients FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage sessions"
  ON sessions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage reports"
  ON reports FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage corrections"
  ON report_corrections FOR ALL USING (auth.role() = 'authenticated');

-- Settings table (key-value store for app configuration)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage settings"
  ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Seed defaults (no-op if already present)
INSERT INTO settings (key, value) VALUES
  ('active_provider', 'openai'),
  ('anthropic_api_key', ''),
  ('openai_api_key', '')
ON CONFLICT (key) DO NOTHING;
