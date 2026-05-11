-- Extend careers_jobs with rich fields matching landing's hardcoded jobs schema.
-- Adds optional fields; existing rows get NULL defaults.

ALTER TABLE careers_jobs ADD COLUMN category TEXT;
ALTER TABLE careers_jobs ADD COLUMN hot INTEGER DEFAULT 0;
ALTER TABLE careers_jobs ADD COLUMN badge TEXT;
ALTER TABLE careers_jobs ADD COLUMN tagline TEXT;
ALTER TABLE careers_jobs ADD COLUMN salary TEXT;
ALTER TABLE careers_jobs ADD COLUMN salary_unit TEXT;
ALTER TABLE careers_jobs ADD COLUMN salary_note TEXT;
ALTER TABLE careers_jobs ADD COLUMN deadline TEXT;
ALTER TABLE careers_jobs ADD COLUMN experience TEXT;
ALTER TABLE careers_jobs ADD COLUMN lead TEXT;
ALTER TABLE careers_jobs ADD COLUMN responsibilities_json TEXT;  -- JSON: { "section": ["item1","item2"] }
ALTER TABLE careers_jobs ADD COLUMN requirements_json TEXT;       -- JSON: ["item1","item2"]
ALTER TABLE careers_jobs ADD COLUMN benefits_json TEXT;           -- JSON: [{i,t,d}]
ALTER TABLE careers_jobs ADD COLUMN bonuses_json TEXT;            -- JSON: ["item1","item2"]
ALTER TABLE careers_jobs ADD COLUMN position INTEGER NOT NULL DEFAULT 99;

CREATE INDEX IF NOT EXISTS idx_careers_jobs_category ON careers_jobs(category);
CREATE INDEX IF NOT EXISTS idx_careers_jobs_position ON careers_jobs(position);

-- Applicants table for /api/v1/applicants POST
CREATE TABLE IF NOT EXISTS careers_applicants (
  id INTEGER PRIMARY KEY,
  job_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cv_url TEXT,
  cover_letter TEXT,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'interview', 'offer', 'rejected', 'archived')),
  source_page TEXT,
  utm_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_careers_applicants_job ON careers_applicants(job_slug, created_at DESC);
CREATE INDEX idx_careers_applicants_status ON careers_applicants(status, created_at DESC);
